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
 * ## Seam for Task 8
 * The `Worker` for code generation is created by EditorPage as local state
 * (`codegenWorker`) and is not exposed via any zustand store. `files` is
 * likewise an EditorPage prop. To render the full `CodePreviewPanel` here,
 * Task 8 must forward:
 *   - `worker: Worker`                    — the EditorPage codegen worker
 *   - `files: ReadonlyArray<WorkspaceFile>` — the workspace files
 *
 * Until those props arrive, this screen shows the `CodegenTargetsTable`
 * (purely presentational, no store or worker dependency) with a muted
 * "preview available in the Code tab" notice so the pane is usable without
 * the Worker prop. This is intentional YAGNI — do not invent a second Worker
 * here; share the one EditorPage already manages.
 *
 * The `onView` / `onDownload` handlers also require the Worker / files seam
 * to function. Until Task 8 wires them, download clicks are no-ops with a
 * console.warn (rather than a crash) so the perspective is safe to render.
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
   * The shared codegen Worker from EditorPage. When absent, the Code Preview
   * section is not rendered (CodePreviewPanel requires a live Worker instance).
   * Wired by Task 8 (PerspectiveHost / App → EditorPage).
   */
  worker?: Worker | null;
  /**
   * User-authored workspace files forwarded from EditorPage, used by the
   * Download flow inside CodePreviewPanel.
   * Wired by Task 8 (PerspectiveHost / App → EditorPage).
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
      if (!worker) {
        console.warn('[ExportPerspective] worker not yet wired — view action is a no-op until Task 8.');
        return;
      }
      if (activeTarget === target) {
        setActiveTarget(undefined);
      } else {
        setActiveTarget(target);
        if (target !== useCodegenStore.getState().codePreviewTarget) {
          setCodePreviewTarget(target);
        }
      }
    },
    [activeTarget, setActiveTarget, setCodePreviewTarget, worker]
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
              Code preview is available in the <strong>Code</strong> tab of the editor. Open a workspace to generate and
              download code from this panel.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
