// @instrumentation-codemod-applied
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

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type {
  DockviewApi,
  DockviewReadyEvent,
  IDockviewHeaderActionsProps,
  IDockviewPanelHeaderProps,
  IDockviewPanelProps
} from 'dockview-react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { DockLayout } from '@rune-langium/design-system/ui/dock-layout';
import { useLatestRef } from '@rune-langium/visual-editor';
import { FileTreePanel } from './panels/FileTreePanel.js';
import { EditorPanel } from './panels/EditorPanel.js';
import { InspectorPanel } from './panels/InspectorPanel.js';
import { ProblemsPanel } from './panels/ProblemsPanel.js';
import { ActivityPanel } from './panels/ActivityPanel.js';
import { OutputPanel } from './panels/OutputPanel.js';
// VisualPreviewPanel removed in Phase 7.5 — structure view is now a peer
// segment in CenterStackPanel wired from EditorPage.
import { FormPreviewPanel } from './panels/FormPreviewPanel.js';
import { CodePreviewPanel as CodePreviewPanelShell } from './panels/CodePreviewPanel.js';
import { buildDefaultLayout, LAYOUT_SCHEMA_VERSION, PANEL_COMPONENT_NAMES } from './layout-factory.js';
import type { LayoutPreset } from './layout-factory.js';
import { sanitizeLayoutWithDiagnostics } from './layout-migrations.js';
import { applyLayout, serializeLayout } from './dockview-bridge.js';
import { installShellShortcuts, type ShellAction } from './keyboard.js';
import type { PanelLayoutRecord } from '../workspace/persistence.js';
import { Button } from '@rune-langium/design-system/ui/button';
import { Alert, AlertDescription } from '@rune-langium/design-system/ui/alert';
import { NumberChiclet } from '@rune-langium/design-system/ui/number-chiclet';
import { UtilityTrayContext } from './utility-tray-context.js';
import { UtilityHeaderActionsContext, UtilityHeaderActionsProvider } from './utility-header-actions-context.js';
import { PerspectiveHeading } from './perspectives/PerspectiveHeading.js';
import { CenterPanesContext, type CenterPane } from './center-panes-context.js';
import { useStudioToast } from '../components/StudioToastProvider.js';
import { useOutputStore, fmtLine } from '../store/output-store.js';
import { withInstrumentation } from '../services/instrumentation/core.js';

const UTILITY_PANEL_IDS = new Set(['workspace.problems', 'workspace.activity', 'workspace.output']);

/**
 * Right-side actions rendered in the dockview group header (FIRST row).
 * For the utility tray group only: the active panel's published toolbar
 * (filters / "..." — see utility-header-actions-context) followed by the
 * open/close chevron. Living in the tab row keeps the whole toolbar
 * visible while the tray is collapsed to header height.
 */
function UtilityGroupHeaderActions(props: IDockviewHeaderActionsProps) {
  const { actions } = useContext(UtilityHeaderActionsContext);
  const { utilitiesCollapsed, toggleUtilities } = useContext(UtilityTrayContext);
  // Use `api.component` (the registered component name, e.g.
  // "workspace.problems") rather than `activePanel.id` — in native (fromJSON)
  // layouts dockview may assign a different panel id (e.g. "p-problems"), so
  // id-based lookup misses the header-actions registry entry and the chevron.
  const activeComponent = props.activePanel?.api.component;
  if (!activeComponent || !UTILITY_PANEL_IDS.has(activeComponent)) return null;
  const label = utilitiesCollapsed ? 'Show Problems & Messages' : 'Hide Problems & Messages';
  return (
    <div className="studio-panel-actions mr-1" aria-label="Utility panel actions">
      {actions.get(activeComponent) ?? null}
      <button
        type="button"
        className="studio-panel-action studio-utility-toggle"
        onClick={toggleUtilities}
        aria-label={label}
        title={label}
        aria-expanded={!utilitiesCollapsed}
        data-testid="toggle-utilities-chevron"
      >
        {utilitiesCollapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>
    </div>
  );
}

const DEFAULT_VIEWPORT_WIDTH = 1920;
const DEFAULT_UTILITY_HEIGHT = 220;
// Collapsed target keeps the group's tabs-and-actions row (first row —
// tabs, panel actions, open/close chevron) fully visible; matches
// BOTTOM_GROUP_MIN_HEIGHT in dockview-bridge.ts.
const COLLAPSED_UTILITY_HEIGHT = 42;
const _PRESET_OPTIONS: Array<{ id: LayoutPreset; label: string }> = [
  { id: 'navigate', label: 'Navigate' },
  { id: 'edit', label: 'Edit' },
  { id: 'preview', label: 'Preview' }
] as const;

const _CENTER_PANE_OPTIONS: Array<{ id: CenterPane; label: string; panel: string }> = [
  { id: 'graph', label: 'Graph', panel: 'workspace.visualPreview' },
  { id: 'structure', label: 'Structure', panel: 'workspace.visualPreview' },
  { id: 'source', label: 'Source', panel: 'workspace.editor' },
  { id: 'inspector', label: 'Inspector', panel: 'workspace.inspector' }
];

type ZeroArgRenderer = () => React.ReactElement | null;
interface PanelTabMeta {
  count?: number;
}

type PanelOverrides = Partial<{
  'workspace.fileTree': ZeroArgRenderer;
  'workspace.editor': ZeroArgRenderer;
  'workspace.inspector': ZeroArgRenderer;
  'workspace.problems': ZeroArgRenderer;
  'workspace.activity': ZeroArgRenderer;
  'workspace.output': ZeroArgRenderer;
  'workspace.visualPreview': ZeroArgRenderer;
  'workspace.formPreview': ZeroArgRenderer;
  'workspace.codePreview': ZeroArgRenderer;
}>;

interface DockShellProps {
  studioVersion: string;
  workspaceId: string;
  initialLayout?: PanelLayoutRecord | null;
  focusPanel?: { component: PanelComponentName; nonce: number } | null;
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
  panelTabMeta?: Partial<Record<PanelComponentName, PanelTabMeta>>;
}

type PanelComponentName = keyof PanelOverrides;
type PanelRegistry = Record<PanelComponentName, ZeroArgRenderer>;

const DEFAULT_PANEL_REGISTRY: PanelRegistry = {
  'workspace.fileTree': () => FileTreePanel({}),
  'workspace.editor': () => EditorPanel({}),
  'workspace.inspector': () => InspectorPanel({}),
  'workspace.problems': () => ProblemsPanel(),
  'workspace.activity': () => ActivityPanel(),
  'workspace.output': () => OutputPanel(),
  'workspace.visualPreview': () => null,
  'workspace.formPreview': () => FormPreviewPanel(),
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

function applyPanelTabMeta(
  api: DockviewApi | null,
  panelTabMeta: Partial<Record<PanelComponentName, PanelTabMeta>> | undefined
): void {
  if (!api || !panelTabMeta) {
    return;
  }
  for (const [panelId, meta] of Object.entries(panelTabMeta)) {
    if (!meta) {
      continue;
    }
    api.getPanel(panelId)?.api.updateParameters(meta);
  }
}

function StudioDockTab({ api, params }: IDockviewPanelHeaderProps<PanelTabMeta>): React.ReactElement {
  const [count, setCount] = useState<number | undefined>(params?.count ?? api.getParameters<PanelTabMeta>()?.count);

  useEffect(() => {
    setCount(params?.count);
  }, [params?.count]);

  useEffect(() => {
    setCount(api.getParameters<PanelTabMeta>()?.count);
    const disposable = api.onDidParametersChange((next) => {
      setCount((next as PanelTabMeta | undefined)?.count);
    });
    return () => disposable.dispose();
  }, [api]);

  return (
    <div className="studio-dock-tab" data-count={count === undefined ? undefined : String(count)}>
      <span className="studio-dock-tab__label">{api.title ?? ''}</span>
      {count !== undefined ? (
        <NumberChiclet className="studio-dock-tab__count" title={`${count} item${count === 1 ? '' : 's'}`}>
          {count}
        </NumberChiclet>
      ) : null}
    </div>
  );
}

export const DockShell = withInstrumentation(
  function DockShell({
    studioVersion,
    workspaceId,
    initialLayout,
    focusPanel,
    panelComponents,
    onLayoutChange,
    onAction,
    panelTabMeta
  }: DockShellProps): React.ReactElement {
    const getViewportWidth = () => (typeof window !== 'undefined' ? window.innerWidth : DEFAULT_VIEWPORT_WIDTH);
    const getSanitizedLayout = useCallback(
      (candidate: PanelLayoutRecord | null | undefined) =>
        sanitizeLayoutWithDiagnostics(candidate ?? null, {
          studioVersion,
          viewportWidth: getViewportWidth()
        }),
      [studioVersion]
    );
    const { showToast } = useStudioToast();
    const showToastRef = useLatestRef(showToast);
    const apiRef = useRef<DockviewApi | null>(null);
    const layoutChangeDisposableRef = useRef<{ dispose(): void } | null>(null);
    const suppressLayoutPersistenceRef = useRef(false);
    const onLayoutChangeRef = useLatestRef(onLayoutChange);

    const [layoutNotice, setLayoutNotice] = useState<string | null>(() => {
      const sanitized = getSanitizedLayout(initialLayout);
      return sanitized.notice ?? null;
    });
    const [layout, setLayout] = useState<PanelLayoutRecord>(() => getSanitizedLayout(initialLayout).layout);
    const [_layoutPreset, setLayoutPreset] = useState<LayoutPreset>(() =>
      layout.dockview && layout.dockview.shape === 'factory' ? (layout.dockview.preset ?? 'edit') : 'edit'
    );
    const [activePanes, setActivePanes] = useState<Set<CenterPane>>(() => new Set<CenterPane>(['structure']));
    const toggleCenterPane = useCallback((pane: CenterPane) => {
      setActivePanes((prev) => {
        const next = new Set(prev);
        if (next.has(pane)) {
          if (next.size <= 1) return prev;
          next.delete(pane);
        } else {
          next.add(pane);
          // Graph ↔ Structure mutual exclusion: showing one always hides
          // the other. They occupy the same conceptual slot (the structural
          // visualisation of the focused type) and the user reported that
          // having both visible at once is wasteful when nodes are expanded.
          if (pane === 'structure' && next.has('graph')) next.delete('graph');
          if (pane === 'graph' && next.has('structure')) next.delete('structure');
        }
        return next;
      });
    }, []);
    // Memoized so CenterPanesContext consumers don't re-render on every
    // DockShell render — only when activePanes itself actually changes
    // (toggleCenterPane is stable via the functional setState form above).
    const centerPanesContextValue = useMemo(
      () => ({ activePanes, toggle: toggleCenterPane }),
      [activePanes, toggleCenterPane]
    );
    const [utilitiesCollapsed, setUtilitiesCollapsedState] = useState<boolean>(() =>
      layout.dockview && layout.dockview.shape === 'factory' ? layout.dockview.bottomGroup.collapsed : false
    );

    // Refs kept current so stable callbacks always read the latest values
    // without needing them as useCallback deps.
    const layoutRef = useLatestRef(layout);
    const studioVersionRef = useLatestRef(studioVersion);
    const panelTabMetaRef = useLatestRef(panelTabMeta);

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
          applyPanelTabMeta(event.api, panelTabMetaRef.current);
          if (currentLayout.dockview?.shape === 'factory') {
            setUtilitiesCollapsedState(currentLayout.dockview.bottomGroup.collapsed);
          } else {
            // Native layouts (persisted after user interaction) restore the
            // bottom group height via fromJSON without carrying an explicit
            // `collapsed` flag — derive it from the restored group height so
            // the chevron direction and first toggle behave correctly.
            const bottomGroup = event.api.getPanel('workspace.problems')?.group;
            if (bottomGroup) {
              setUtilitiesCollapsedState(bottomGroup.api.height <= COLLAPSED_UTILITY_HEIGHT + 8);
            }
          }
        } catch (err) {
          const fallback = buildDefaultLayout({
            studioVersion: currentVersion,
            viewportWidth: getViewportWidth()
          });
          console.error('[DockShell] Failed to apply layout, falling back to default layout', err);
          useOutputStore
            .getState()
            .addLine(
              fmtLine(
                'layout',
                'failed to apply saved layout, using default',
                err instanceof Error ? err.message : String(err)
              ),
              'warn'
            );
          showToast({
            title: 'Layout restored to default',
            description: 'Your saved layout could not be applied.',
            variant: 'default'
          });
          appliedLayout = fallback;
          setLayout(fallback);
          setLayoutPreset(fallback.dockview?.shape === 'factory' ? (fallback.dockview.preset ?? 'edit') : 'edit');
          setUtilitiesCollapsedState(
            fallback.dockview?.shape === 'factory' ? fallback.dockview.bottomGroup.collapsed : false
          );
          event.api.clear();
          applyLayout(event.api, fallback);
          applyPanelTabMeta(event.api, panelTabMetaRef.current);
        }

        // Persist on every layout change. The serialized JSON replaces our
        // factory-shape layout so subsequent mounts go through fromJSON.
        layoutChangeDisposableRef.current = event.api.onDidLayoutChange(() => {
          if (!onLayoutChangeRef.current) return;
          if (suppressLayoutPersistenceRef.current) return;
          if (event.api.panels.length === 0) {
            console.warn('[DockShell] Skipping persistence of empty dock layout');
            return;
          }
          try {
            const dockviewJson = serializeLayout(event.api);
            onLayoutChangeRef.current({
              version: LAYOUT_SCHEMA_VERSION,
              writtenBy: studioVersionRef.current,
              dockview: dockviewJson as PanelLayoutRecord['dockview']
            });
          } catch (err) {
            console.error('[DockShell] Failed to serialize layout change', err);
            useOutputStore
              .getState()
              .addLine(
                fmtLine('layout', 'failed to persist layout change', err instanceof Error ? err.message : String(err)),
                'warn'
              );
            showToastRef.current({
              title: 'Layout not saved',
              description: 'Could not persist the current panel arrangement.',
              variant: 'destructive'
            });
          }
        });
        onLayoutChangeRef.current?.(appliedLayout);
      },
      [] // stable — reads layout and studioVersion via refs above
    );

    const panelRegistry = useMemo(() => mergePanelRegistry(panelComponents), [panelComponents]);

    const suppressLayoutPersistence = useCallback((work: () => void) => {
      suppressLayoutPersistenceRef.current = true;
      try {
        work();
      } finally {
        queueMicrotask(() => {
          suppressLayoutPersistenceRef.current = false;
        });
      }
    }, []);

    // Monotonically-increasing token so a re-toggle mid-animation cancels the
    // in-flight tween (the stale rAF loop sees a newer token and stops).
    // Bumped on EVERY path (animated, immediate, unmount) so no stale loop
    // survives. `utilityHeightRef` tracks the last height we applied so a
    // mid-flight reversal tweens from where the tray actually is instead of
    // snapping to a hardcoded endpoint.
    const utilityTweenTokenRef = useRef(0);
    const utilityHeightRef = useRef<number | null>(null);

    // Cancel any in-flight tray tween on unmount — the rAF loop would
    // otherwise keep calling setSize on a disposed dockview group.
    useEffect(() => {
      return () => {
        utilityTweenTokenRef.current++;
      };
    }, []);

    const setUtilitiesCollapsed = useCallback((collapsed: boolean) => {
      setUtilitiesCollapsedState(collapsed);
      const token = ++utilityTweenTokenRef.current;
      const problemsPanel = apiRef.current?.getPanel('workspace.problems');
      if (!problemsPanel) {
        return;
      }
      const target = collapsed ? COLLAPSED_UTILITY_HEIGHT : DEFAULT_UTILITY_HEIGHT;
      const groupApi = problemsPanel.group.api;
      // Animate the tray height with a short ease-out tween. Skip straight to
      // the target when the environment can't animate (jsdom has no
      // matchMedia) or the user prefers reduced motion.
      let reduceMotion = true;
      try {
        reduceMotion =
          typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch {
        reduceMotion = true;
      }
      if (reduceMotion || typeof requestAnimationFrame !== 'function') {
        utilityHeightRef.current = target;
        groupApi.setSize({ height: target });
        return;
      }
      // Start from the last height this code applied (mid-flight reversal),
      // falling back to the logical opposite endpoint on the first toggle.
      const from = utilityHeightRef.current ?? (collapsed ? DEFAULT_UTILITY_HEIGHT : COLLAPSED_UTILITY_HEIGHT);
      const durationMs = 220;
      const start = performance.now();
      const step = (now: number) => {
        if (utilityTweenTokenRef.current !== token) return;
        const p = Math.min(1, (now - start) / durationMs);
        const eased = 1 - (1 - p) ** 3; // ease-out cubic
        const height = Math.round(from + (target - from) * eased);
        utilityHeightRef.current = height;
        try {
          groupApi.setSize({ height });
        } catch {
          // Group disposed mid-tween (layout reset/teardown) — stop quietly.
          return;
        }
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, []);

    const toggleUtilities = useCallback(() => {
      setUtilitiesCollapsed(!utilitiesCollapsed);
    }, [setUtilitiesCollapsed, utilitiesCollapsed]);
    // Memoized so UtilityTrayContext consumers don't re-render on every
    // DockShell render — only when one of these actually changes.
    const utilityTrayContextValue = useMemo(
      () => ({ utilitiesCollapsed, setUtilitiesCollapsed, toggleUtilities }),
      [utilitiesCollapsed, setUtilitiesCollapsed, toggleUtilities]
    );

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

    useEffect(() => {
      applyPanelTabMeta(apiRef.current, panelTabMeta);
    }, [panelTabMeta]);

    useEffect(() => {
      if (!focusPanel) {
        return;
      }
      const panel = apiRef.current?.getPanel(focusPanel.component);
      panel?.api.setActive();
    }, [focusPanel]);

    function resetLayout(): void {
      const fresh = buildDefaultLayout({ studioVersion, viewportWidth: getViewportWidth() });
      setLayout(fresh);
      setLayoutPreset(fresh.dockview?.shape === 'factory' ? (fresh.dockview.preset ?? 'edit') : 'edit');
      setUtilitiesCollapsedState(fresh.dockview?.shape === 'factory' ? fresh.dockview.bottomGroup.collapsed : false);
      if (apiRef.current) {
        try {
          suppressLayoutPersistence(() => {
            apiRef.current?.clear();
            if (!apiRef.current) return;
            applyLayout(apiRef.current, fresh);
            applyPanelTabMeta(apiRef.current, panelTabMetaRef.current);
          });
        } catch (err) {
          console.error('[DockShell] Failed to reset layout', err);
          useOutputStore
            .getState()
            .addLine(
              fmtLine('layout', 'failed to reset layout', err instanceof Error ? err.message : String(err)),
              'error'
            );
          showToast({
            title: 'Layout reset failed',
            description: err instanceof Error ? err.message : 'Could not reset the panel layout.',
            variant: 'destructive'
          });
        }
      }
      onLayoutChangeRef.current?.(fresh);
    }

    return (
      <div
        role="application"
        aria-label="Studio dock shell"
        className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col"
        data-testid="dock-shell"
        data-workspace-id={workspaceId}
      >
        <div
          role="toolbar"
          aria-label="Studio layout presets"
          className="studio-layout-presets"
          data-testid="studio-layout-presets"
        >
          <PerspectiveHeading perspectiveId="explore" />
          <div className="studio-layout-presets__group studio-layout-presets__group--actions">
            <Button
              type="button"
              variant="secondary"
              size="xs"
              onClick={toggleUtilities}
              data-testid="toggle-utilities"
              aria-pressed={!utilitiesCollapsed}
              className="studio-chrome-button"
            >
              {utilitiesCollapsed ? 'Show utilities' : 'Hide utilities'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              onClick={resetLayout}
              data-testid="reset-layout"
              className="studio-chrome-button"
            >
              Reset layout
            </Button>
          </div>
        </div>
        {layoutNotice ? (
          <Alert
            role="status"
            aria-live="polite"
            className="flex items-center justify-between rounded-none border-x-0 border-t-0 bg-muted/60 px-3 py-1.5 text-xs"
            data-testid="layout-reset-notice"
          >
            <AlertDescription className="grid-cols-[1fr_auto] flex w-full items-center justify-between">
              <span>{layoutNotice}</span>
              <button type="button" className="ml-2 font-medium" onClick={() => setLayoutNotice(null)}>
                Dismiss
              </button>
            </AlertDescription>
          </Alert>
        ) : null}
        <CenterPanesContext.Provider value={centerPanesContextValue}>
          <PanelRegistryContext.Provider value={panelRegistry}>
            <UtilityTrayContext.Provider value={utilityTrayContextValue}>
              <UtilityHeaderActionsProvider>
                <div className="min-h-0 min-w-0 flex-1">
                  <DockLayout
                    components={DOCKVIEW_COMPONENTS}
                    defaultTabComponent={StudioDockTab}
                    rightHeaderActionsComponent={UtilityGroupHeaderActions}
                    onReady={onReady}
                    className="h-full min-w-0 w-full"
                  />
                </div>
              </UtilityHeaderActionsProvider>
            </UtilityTrayContext.Provider>
          </PanelRegistryContext.Provider>
        </CenterPanesContext.Provider>
      </div>
    );
  },
  { op: 'DockShell' }
);
