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
import { buildDefaultLayout } from './layout-factory.js';
import { sanitizeLayout } from './layout-migrations.js';
import { applyLayout, serializeLayout } from './dockview-bridge.js';
import { installShellShortcuts, type ShellAction } from './keyboard.js';
import type { PanelLayoutRecord } from '../workspace/persistence.js';

interface DockShellProps {
  studioVersion: string;
  workspaceId: string;
  initialLayout?: PanelLayoutRecord | null;
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

const DOCKVIEW_COMPONENTS = {
  'workspace.fileTree': wrapForDockview(FileTreePanel),
  'workspace.editor': wrapForDockview(EditorPanel),
  'workspace.inspector': wrapForDockview(InspectorPanel),
  'workspace.problems': wrapForDockview(ProblemsPanel),
  'workspace.output': wrapForDockview(OutputPanel),
  'workspace.visualPreview': wrapForDockview(VisualPreviewPanel)
};

export function DockShell({
  studioVersion,
  workspaceId,
  initialLayout,
  onLayoutChange,
  onAction
}: DockShellProps): React.ReactElement {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const apiRef = useRef<DockviewApi | null>(null);
  const onLayoutChangeRef = useRef(onLayoutChange);
  onLayoutChangeRef.current = onLayoutChange;

  const [layout, setLayout] = useState<PanelLayoutRecord>(() =>
    sanitizeLayout(initialLayout ?? null, { studioVersion, viewportWidth })
  );

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      apiRef.current = event.api;
      applyLayout(event.api, layout);

      // Persist on every layout change. The serialized JSON replaces our
      // factory-shape layout so subsequent mounts go through fromJSON.
      const disposable = event.api.onDidLayoutChange(() => {
        if (!onLayoutChangeRef.current) return;
        const dockviewJson = serializeLayout(event.api);
        onLayoutChangeRef.current({
          version: 1,
          writtenBy: studioVersion,
          dockview: dockviewJson as PanelLayoutRecord['dockview']
        });
      });
      onLayoutChangeRef.current?.(layout);
      return () => disposable.dispose();
    },
    [layout, studioVersion]
  );

  useEffect(() => {
    return installShellShortcuts(window, (action) => {
      onAction?.(action);
    });
  }, [onAction]);

  function resetLayout(): void {
    const fresh = buildDefaultLayout({ studioVersion, viewportWidth });
    setLayout(fresh);
    if (apiRef.current) {
      apiRef.current.clear();
      applyLayout(apiRef.current, fresh);
    }
    onLayoutChangeRef.current?.(fresh);
  }

  return (
    <div
      role="application"
      aria-label="Studio dock shell"
      data-testid="dock-shell"
      data-workspace-id={workspaceId}
    >
      <DockviewReact
        components={DOCKVIEW_COMPONENTS}
        onReady={onReady}
        className="dockview-theme-light"
      />
      <button type="button" onClick={resetLayout} data-testid="reset-layout">
        Reset layout
      </button>
    </div>
  );
}
