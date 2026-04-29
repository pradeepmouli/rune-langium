// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * DockShell — host for the locked Studio panels, backed by `dockview-react`.
 *
 * Responsibilities:
 *  - register the locked panel components by their names
 *    (`workspace.fileTree` etc., from contracts/dockview-panel-registry.md)
 *  - apply the saved `PanelLayoutRecord` on mount via the bridge:
 *      • factory-shape layout (fresh / Reset)  → addPanel calls
 *      • dockview-native layout (returning user) → api.fromJSON
 *  - serialize the live layout via `api.toJSON()` on each onDidLayoutChange
 *    and forward to the workspace persistence layer
 *  - install the keyboard shortcut layer
 *  - expose Reset Layout as a button (command-palette wiring lands in Phase 8)
 *
 * In jsdom (vitest) the real DockviewReact can't render — its layout
 * engine depends on getBoundingClientRect / ResizeObserver. Tests mock
 * the `dockview-react` module and assert through plain DOM. The component
 * continues to mount the panel ARIA-host elements directly so role/test
 * assertions remain reachable.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import type React from 'react';
import { DockviewReact } from 'dockview-react';
import type { DockviewApi, IDockviewPanelProps, DockviewReadyEvent } from 'dockview-react';
import { FileTreePanel } from './panels/FileTreePanel.js';
import { EditorPanel } from './panels/EditorPanel.js';
import { InspectorPanel } from './panels/InspectorPanel.js';
import { ProblemsPanel } from './panels/ProblemsPanel.js';
import { OutputPanel } from './panels/OutputPanel.js';
import { VisualPreviewPanel } from './panels/VisualPreviewPanel.js';
import { FormPreviewPanel } from './panels/FormPreviewPanel.js';
import { CodePreviewPanel as CodePreviewPanelShell } from './panels/CodePreviewPanel.js';
import { buildDefaultLayout, PANEL_COMPONENT_NAMES } from './layout-factory.js';
import { sanitizeLayout } from './layout-migrations.js';
import { applyLayout, serializeLayout } from './dockview-bridge.js';
import { installShellShortcuts, type ShellAction } from './keyboard.js';
import type { PanelLayoutRecord } from '../workspace/persistence.js';
import { Button } from '@rune-langium/design-system/ui/button';
import { UtilityTrayContext } from './utility-tray-context.js';

const DEFAULT_VIEWPORT_WIDTH = 1920;
const DEFAULT_UTILITY_HEIGHT = 220;

type PanelOverrides = Partial<{
  'workspace.fileTree': React.FC;
  'workspace.editor': React.FC;
  'workspace.inspector': React.FC;
  'workspace.problems': React.FC;
  'workspace.output': React.FC;
  'workspace.visualPreview': React.FC;
  'workspace.formPreview': React.FC;
  'workspace.codePreview': React.FC;
}>;

interface DockShellProps {
  studioVersion: string;
  workspaceId: string;
  initialLayout?: PanelLayoutRecord | null;
  /**
   * Override one or more panels with real content. Components are
   * rendered as the body of their named dockview panel. Tests omit this
   * (the default stub panels are reachable via test-id); the live app
   * supplies real components from EditorPage so the dock shell hosts
   * the working studio surface.
   */
  panelComponents?: PanelOverrides;
  onLayoutChange?: (layout: PanelLayoutRecord) => void;
  onAction?: (action: ShellAction) => void;
}

type PanelComponentName = keyof PanelOverrides;
type PanelRegistry = Record<PanelComponentName, React.FC>;

const DEFAULT_PANEL_REGISTRY: PanelRegistry = {
  'workspace.fileTree': FileTreePanel,
  'workspace.editor': EditorPanel,
  'workspace.inspector': InspectorPanel,
  'workspace.problems': ProblemsPanel,
  'workspace.output': OutputPanel,
  'workspace.visualPreview': VisualPreviewPanel,
  'workspace.formPreview': FormPreviewPanel,
  'workspace.codePreview': CodePreviewPanelShell
};

const PanelRegistryContext = createContext<PanelRegistry>(DEFAULT_PANEL_REGISTRY);

function mergePanelRegistry(overrides: PanelOverrides | undefined): PanelRegistry {
  return {
    ...DEFAULT_PANEL_REGISTRY,
    ...overrides
  };
}

function createDockviewPanelBridge(name: PanelComponentName): React.FC<IDockviewPanelProps> {
  function DockviewPanelBridge() {
    const registry = useContext(PanelRegistryContext);
    // Cast to a zero-arg render function before calling. All panel components
    // (both stubs and live overrides from EditorPage) take no props — they
    // close over their data via context / hooks. Calling directly (rather than
    // rendering as JSX) prevents React from treating a new function reference
    // as a new component type, which would unmount and remount the subtree
    // (destroying the CodeMirror editor) on every files-state change.
    const renderPanel = registry[name] as (
      props?: Record<string, never>
    ) => React.ReactElement | null;
    return renderPanel({});
  }

  DockviewPanelBridge.displayName = `DockviewPanelBridge(${name})`;
  return DockviewPanelBridge;
}

const DOCKVIEW_COMPONENTS: Record<string, React.FC<IDockviewPanelProps>> = Object.fromEntries(
  PANEL_COMPONENT_NAMES.map((name) => [name, createDockviewPanelBridge(name as PanelComponentName)])
);

export function DockShell({
  studioVersion,
  workspaceId,
  initialLayout,
  panelComponents,
  onLayoutChange,
  onAction
}: DockShellProps): React.ReactElement {
  const getViewportWidth = () =>
    typeof window !== 'undefined' ? window.innerWidth : DEFAULT_VIEWPORT_WIDTH;
  const apiRef = useRef<DockviewApi | null>(null);
  const layoutChangeDisposableRef = useRef<{ dispose(): void } | null>(null);
  const onLayoutChangeRef = useRef(onLayoutChange);
  onLayoutChangeRef.current = onLayoutChange;

  const [layout, setLayout] = useState<PanelLayoutRecord>(() =>
    sanitizeLayout(initialLayout ?? null, { studioVersion, viewportWidth: getViewportWidth() })
  );
  const [utilitiesCollapsed, setUtilitiesCollapsedState] = useState<boolean>(() =>
    layout.dockview && layout.dockview.shape === 'factory'
      ? layout.dockview.bottomGroup.collapsed
      : false
  );

  // Refs kept current on every render so stable callbacks always read
  // the latest values without needing them as useCallback deps.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const studioVersionRef = useRef(studioVersion);
  studioVersionRef.current = studioVersion;

  // onReady is called exactly once by dockview (on mount). Including
  // layout/studioVersion as deps would recreate the callback whenever
  // those change, but the new function would never be invoked — the old
  // closure would remain permanently stale. Using refs avoids the dep
  // while guaranteeing we always read the current value.
  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const currentLayout = layoutRef.current;
      const currentVersion = studioVersionRef.current;
      apiRef.current = event.api;
      layoutChangeDisposableRef.current?.dispose();
      let appliedLayout = currentLayout;

      try {
        applyLayout(event.api, currentLayout);
        if (currentLayout.dockview?.shape === 'factory') {
          setUtilitiesCollapsedState(currentLayout.dockview.bottomGroup.collapsed);
        }
      } catch (err) {
        const fallback = buildDefaultLayout({
          studioVersion: currentVersion,
          viewportWidth: getViewportWidth()
        });
        console.error('[DockShell] Failed to apply layout, falling back to default layout', err);
        appliedLayout = fallback;
        setLayout(fallback);
        setUtilitiesCollapsedState(
          fallback.dockview?.shape === 'factory' ? fallback.dockview.bottomGroup.collapsed : false
        );
        event.api.clear();
        applyLayout(event.api, fallback);
      }

      // Persist on every layout change. The serialized JSON replaces our
      // factory-shape layout so subsequent mounts go through fromJSON.
      layoutChangeDisposableRef.current = event.api.onDidLayoutChange(() => {
        if (!onLayoutChangeRef.current) return;
        try {
          const dockviewJson = serializeLayout(event.api);
          onLayoutChangeRef.current({
            version: 1,
            writtenBy: studioVersionRef.current,
            dockview: dockviewJson as PanelLayoutRecord['dockview']
          });
        } catch (err) {
          console.error('[DockShell] Failed to serialize layout change', err);
        }
      });
      onLayoutChangeRef.current?.(appliedLayout);
    },
    [] // stable — reads layout and studioVersion via refs above
  );

  const panelRegistry = useMemo(() => mergePanelRegistry(panelComponents), [panelComponents]);

  const setUtilitiesCollapsed = useCallback((collapsed: boolean) => {
    setUtilitiesCollapsedState(collapsed);
    const problemsPanel = apiRef.current?.getPanel('workspace.problems');
    if (!problemsPanel) {
      return;
    }
    problemsPanel.group.api.setSize(collapsed ? { height: 0 } : { height: DEFAULT_UTILITY_HEIGHT });
  }, []);

  const toggleUtilities = useCallback(() => {
    setUtilitiesCollapsed(!utilitiesCollapsed);
  }, [setUtilitiesCollapsed, utilitiesCollapsed]);

  useEffect(() => {
    return installShellShortcuts(window, (action) => {
      onAction?.(action);
    });
  }, [onAction]);

  useEffect(
    () => () => {
      layoutChangeDisposableRef.current?.dispose();
      layoutChangeDisposableRef.current = null;
    },
    []
  );

  function resetLayout(): void {
    const fresh = buildDefaultLayout({ studioVersion, viewportWidth: getViewportWidth() });
    setLayout(fresh);
    setUtilitiesCollapsedState(
      fresh.dockview?.shape === 'factory' ? fresh.dockview.bottomGroup.collapsed : false
    );
    if (apiRef.current) {
      try {
        apiRef.current.clear();
        applyLayout(apiRef.current, fresh);
      } catch (err) {
        console.error('[DockShell] Failed to reset layout', err);
      }
    }
    onLayoutChangeRef.current?.(fresh);
  }

  return (
    <div
      role="application"
      aria-label="Studio dock shell"
      className="relative flex h-full flex-col"
      data-testid="dock-shell"
      data-workspace-id={workspaceId}
    >
      <div
        role="group"
        aria-label="Studio mode groups"
        className="studio-mode-header"
        data-testid="studio-mode-header"
      >
        <div className="studio-mode-header__item studio-mode-header__item--navigate">Navigate</div>
        <div className="studio-mode-header__item studio-mode-header__item--edit">Edit</div>
        <div className="studio-mode-header__item studio-mode-header__item--visualize">
          Visualize
        </div>
        <div className="studio-mode-header__item studio-mode-header__item--preview">Preview</div>
      </div>
      <PanelRegistryContext.Provider value={panelRegistry}>
        <UtilityTrayContext.Provider
          value={{ utilitiesCollapsed, setUtilitiesCollapsed, toggleUtilities }}
        >
          <div className="min-h-0 flex-1">
            <DockviewReact
              components={DOCKVIEW_COMPONENTS}
              onReady={onReady}
              className="dockview-theme-abyss"
            />
          </div>
        </UtilityTrayContext.Provider>
      </PanelRegistryContext.Provider>
      <Button
        type="button"
        variant="secondary"
        size="xs"
        onClick={toggleUtilities}
        data-testid="toggle-utilities"
        aria-pressed={!utilitiesCollapsed}
        className="studio-chrome-button absolute right-28 bottom-3 z-10 shadow-lg"
      >
        {utilitiesCollapsed ? 'Show utilities' : 'Hide utilities'}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="xs"
        onClick={resetLayout}
        data-testid="reset-layout"
        className="studio-chrome-button absolute right-3 bottom-3 z-10 shadow-lg"
      >
        Reset layout
      </Button>
    </div>
  );
}
