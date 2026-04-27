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

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { buildDefaultLayout } from './layout-factory.js';
import { sanitizeLayout } from './layout-migrations.js';
import { applyLayout, serializeLayout } from './dockview-bridge.js';
import { installShellShortcuts, type ShellAction } from './keyboard.js';
import type { PanelLayoutRecord } from '../workspace/persistence.js';

const DEFAULT_VIEWPORT_WIDTH = 1920;

type PanelOverrides = Partial<{
  'workspace.fileTree': React.FC;
  'workspace.editor': React.FC;
  'workspace.inspector': React.FC;
  'workspace.problems': React.FC;
  'workspace.output': React.FC;
  'workspace.visualPreview': React.FC;
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

// Each dockview panel receives `{ params, api }` props. Our panels don't
// need params today — wrap each one so dockview can mount it generically.
function wrapForDockview<P extends object>(Component: React.FC<P>): React.FC<IDockviewPanelProps> {
  return function Wrapped() {
    return <Component {...({} as P)} />;
  };
}

function mergeComponents(
  defaults: Record<string, React.FC<IDockviewPanelProps>>,
  overrides: PanelOverrides | undefined
): Record<string, React.FC<IDockviewPanelProps>> {
  if (!overrides) return defaults;
  const out: Record<string, React.FC<IDockviewPanelProps>> = { ...defaults };
  for (const [name, Component] of Object.entries(overrides)) {
    if (Component) out[name] = wrapForDockview(Component);
  }
  return out;
}

const DEFAULT_DOCKVIEW_COMPONENTS = {
  'workspace.fileTree': wrapForDockview(FileTreePanel),
  'workspace.editor': wrapForDockview(EditorPanel),
  'workspace.inspector': wrapForDockview(InspectorPanel),
  'workspace.problems': wrapForDockview(ProblemsPanel),
  'workspace.output': wrapForDockview(OutputPanel),
  'workspace.visualPreview': wrapForDockview(VisualPreviewPanel),
  'workspace.codePreview': wrapForDockview(CodePreviewPanelShell)
};

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

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      apiRef.current = event.api;
      layoutChangeDisposableRef.current?.dispose();
      let appliedLayout = layout;

      try {
        applyLayout(event.api, layout);
      } catch (err) {
        const fallback = buildDefaultLayout({
          studioVersion,
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
            writtenBy: studioVersion,
            dockview: dockviewJson as PanelLayoutRecord['dockview']
          });
        } catch (err) {
          console.error('[DockShell] Failed to serialize layout change', err);
        }
      });
      onLayoutChangeRef.current?.(appliedLayout);
    },
    [layout, studioVersion]
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
      className="h-full"
      data-testid="dock-shell"
      data-workspace-id={workspaceId}
    >
      <DockviewReact
        components={mergeComponents(DEFAULT_DOCKVIEW_COMPONENTS, panelComponents)}
        onReady={onReady}
        className="dockview-theme-abyss"
      />
      <button type="button" onClick={resetLayout} data-testid="reset-layout">
        Reset layout
      </button>
    </div>
  );
}
