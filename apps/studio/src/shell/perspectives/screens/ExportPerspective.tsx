// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * ExportPerspective — full-height sidebar screen for code generation + export.
 *
 * Composes the existing studio export surfaces:
 *   - `CodegenTargetsTable` — purely presentational, reads nothing from stores.
 *   - `CodePreviewPanel`   — store-backed (useCodegenStore), but ALSO needs a
 *                            `Worker` instance and `files` that live in EditorPage.
 *   - `DownloadConfigModal`  — opened by CodePreviewPanel; no extra seam needed.
 *
 * PerspectiveHost forwards EditorPage's `codegenWorker` + `files` here:
 *   - `worker: Worker`                    — the EditorPage codegen worker
 *   - `files: ReadonlyArray<WorkspaceFile>` — the workspace files
 *
 * When `worker` is absent (degraded / transient state while EditorPage spins
 * up), this screen shows the `CodegenTargetsTable` with a loading notice.
 * Target selection still updates the store so the row highlights correctly.
 * Download is a no-op with a console.warn until the worker is available.
 *
 * Note on double-mount: the docked `workspace.codePreview` panel rendered by
 * DockShell uses the SHELL STUB (`src/shell/panels/CodePreviewPanel.tsx`) which
 * is display-only (reads store label, no worker listener). Only this file mounts
 * the real `CodePreviewPanel` (from `src/components/CodePreviewPanel.tsx`) —
 * and only when `worker` is non-null. There is therefore no double-subscription
 * to the codegen worker at any point.
 */

import type { ReactElement } from 'react';
import { useCallback } from 'react';
import type { Target } from '@rune-langium/codegen';
import { CodegenTargetsTable } from '../../../components/CodegenTargetsTable.js';
import { CodePreviewPanel } from '../../../components/CodePreviewPanel.js';
import type { SourceEditorHandle } from '../../../components/CodePreviewPanel.js';
import type { WorkspaceFile } from '../../../services/workspace.js';
import { useCodegenStore } from '../../../store/codegen-store.js';

export interface ExportPerspectiveProps {
  /**
   * The shared codegen Worker forwarded from EditorPage via PerspectiveHost.
   * When absent the perspective operates in degraded mode: the targets table
   * is shown with a loading notice; target selection still updates the store.
   */
  worker?: Worker | null;
  /**
   * User-authored workspace files forwarded from EditorPage via PerspectiveHost,
   * used by the Download flow inside CodePreviewPanel.
   */
  files?: ReadonlyArray<WorkspaceFile>;
  /**
   * Optional source-editor handle for source-map click-through navigation
   * inside CodePreviewPanel. Safe to omit in the sidebar context — the panel
   * degrades gracefully.
   */
  sourceEditorRef?: SourceEditorHandle | null;
}

export function ExportPerspective({ worker, files, sourceEditorRef = null }: ExportPerspectiveProps): ReactElement {
  const activeTarget = useCodegenStore((s) => s.activeTarget);
  const setActiveTarget = useCodegenStore((s) => s.setActiveTarget);
  const setCodePreviewTarget = useCodegenStore((s) => s.setCodePreviewTarget);

  const handleView = useCallback(
    (target: Target) => {
      // Always update the store so the row highlights correctly, regardless of
      // whether the worker is present. The worker is only needed when CodePreview-
      // Panel is mounted (full mode); store updates are safe in degraded mode.
      if (activeTarget === target) {
        setActiveTarget(undefined);
      } else {
        setActiveTarget(target);
        if (target !== useCodegenStore.getState().codePreviewTarget) {
          setCodePreviewTarget(target);
        }
      }
    },
    [activeTarget, setActiveTarget, setCodePreviewTarget]
  );

  const handleDownload = useCallback(
    (target: Target) => {
      if (!worker) {
        console.warn('[ExportPerspective] worker not yet wired — download action is a no-op until Task 8.');
        return;
      }
      // When the worker is available, delegate to CodePreviewPanel by triggering
      // its download flow. Until CodePreviewPanel is mounted (worker present),
      // the only way to reach a download is through that panel; targeting the
      // same target activates it so the panel's own download affordance is
      // accessible via the "View" flow first.
      if (activeTarget !== target) {
        setActiveTarget(target);
        if (target !== useCodegenStore.getState().codePreviewTarget) {
          setCodePreviewTarget(target);
        }
      }
      // Let the user trigger Download from inside the now-visible panel.
      // A direct programmatic download is deferred: it requires the modal
      // (DownloadConfigModal) which lives inside CodePreviewPanel. Delegating
      // is simpler and avoids duplicating the modal here.
      void target; // suppress unused-var lint; target drives the activate above
    },
    [activeTarget, setActiveTarget, setCodePreviewTarget, worker]
  );

  return (
    <section data-testid="export-perspective" className="h-full overflow-auto flex flex-col">
      <div className="shrink-0 px-6 py-4 border-b border-border/70">
        <h1 className="text-lg font-semibold">Export</h1>
      </div>

      {worker ? (
        /* Full CodePreviewPanel — self-contained with useCodegenStore + worker */
        <div className="flex-1 min-h-0 overflow-hidden">
          <CodePreviewPanel
            worker={worker}
            files={files as WorkspaceFile[] | undefined}
            sourceEditorRef={sourceEditorRef}
          />
        </div>
      ) : (
        /* Degraded: show the targets table + a note; no worker yet */
        <div className="flex flex-col flex-1 min-h-0">
          <div data-testid="export-targets-section" className="shrink-0">
            <CodegenTargetsTable onView={handleView} onDownload={handleDownload} activeTarget={activeTarget} />
          </div>
          <div
            data-testid="export-worker-pending"
            className="flex-1 flex items-center justify-center px-6 py-8 text-center"
          >
            <p className="text-xs text-muted-foreground max-w-[22rem]">
              Preparing the code generator… Code preview will appear here once the generator is ready.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
