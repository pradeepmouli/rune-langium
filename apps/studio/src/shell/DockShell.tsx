// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * DockShell — host for the six locked panels, backed by `dockview-react`.
 *
 * Responsibilities:
 *  - register the six panel components by their locked names
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
import { CodePreviewPanel as CodePreviewPanelShell } from './panels/CodePreviewPanel.js';
import { buildDefaultLayout, PANEL_COMPONENT_NAMES } from './layout-factory.js';
import { sanitizeLayout } from './layout-migrations.js';
import { applyLayout, serializeLayout } from './dockview-bridge.js';
import { installShellShortcuts, type ShellAction } from './keyboard.js';
import type { PanelLayoutRecord } from '../workspace/persistence.js';
import { Button } from '@rune-langium/design-system/ui/button';

const DEFAULT_VIEWPORT_WIDTH = 1920;

type ZeroArgRenderer = () => React.ReactElement | null;

type PanelOverrides = Partial<{
  'workspace.fileTree': ZeroArgRenderer;
  'workspace.editor': ZeroArgRenderer;
  'workspace.inspector': ZeroArgRenderer;
  'workspace.problems': ZeroArgRenderer;
  'workspace.output': ZeroArgRenderer;
  'workspace.visualPreview': ZeroArgRenderer;
  'workspace.codePreview': ZeroArgRenderer;
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
type PanelRegistry = Record<PanelComponentName, ZeroArgRenderer>;

const DEFAULT_PANEL_REGISTRY: PanelRegistry = {
  'workspace.fileTree': () => FileTreePanel({}),
  'workspace.editor': () => EditorPanel({}),
  'workspace.inspector': () => InspectorPanel({}),
  'workspace.problems': () => ProblemsPanel({}),
  'workspace.output': () => OutputPanel({}),
  'workspace.visualPreview': () => VisualPreviewPanel({}),
  'workspace.codePreview': () => CodePreviewPanelShell({})
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
    // Call the registry function directly (not as JSX) so React does NOT see a
    // new component type when the function reference changes — which would
    // unmount and remount the subtree (destroying the CodeMirror editor).
    // Registry entries are explicitly typed as zero-arg renderers so this is
    // safe without any cast.
    const renderPanel = registry[name];
    return renderPanel();
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
      } catch (err) {
        const fallback = buildDefaultLayout({
          studioVersion: currentVersion,
          viewportWidth: getViewportWidth()
        });
        console.error('[DockShell] Failed to apply layout, falling back to default layout', err);
        appliedLayout = fallback;
        setLayout(fallback);
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
      className="relative h-full"
      data-testid="dock-shell"
      data-workspace-id={workspaceId}
    >
      <PanelRegistryContext.Provider value={panelRegistry}>
        <DockviewReact
          components={DOCKVIEW_COMPONENTS}
          onReady={onReady}
          className="dockview-theme-abyss"
        />
      </PanelRegistryContext.Provider>
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
