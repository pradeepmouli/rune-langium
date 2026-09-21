// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * ExportPerspective — full-height sidebar screen for code generation + export.
 *
 * This is a READ-ONLY consumer of `useCodegenStore`. It does NOT subscribe to
 * the codegen worker and does NOT post messages. The single worker owner is
 * EditorPage, which drives `codegen:generate` requests and dispatches results
 * into the store (Codex P2 fix — no double-subscription).
 *
 * Layout:
 *   - `CodegenTargetsTable` — target selector; selecting a target calls
 *     `setActiveTarget`/`setCodePreviewTarget` which EditorPage's effect
 *     observes to trigger generation.
 *   - Read-only preview — displays the generated output from `useCodegenStore`
 *     (the `snapshot` populated by `receiveCodePreviewResult`).
 *   - Download — opens `DownloadConfigDialog` and calls `downloadTargetViaRouter`
 *     (the same client-side /api/codegen route used by CodePreviewPanel).
 *   - Empty state — shown when no snapshot is available yet.
 */

import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ExportSelection, Target } from '@rune-langium/codegen/export';
import { CodegenTargetsTable } from '../../../components/CodegenTargetsTable.js';
import { DownloadConfigDialog, type DownloadConfig } from '../../../components/DownloadConfigDialog.js';
import { ExcelOptionsFormAdapter } from '../../../codegen-forms/ExcelOptionsFormAdapter.js';
import {
  downloadTargetViaRouter,
  CodegenDownloadError,
  collectCuratedBundlesFromWorkspace,
  collectCuratedSourcesForCodegen,
  type WorkspaceFile
} from '../../../services/workspace.js';
import { useCodegenStore } from '../../../store/codegen-store.js';
import { useOutputStore, fmtLine } from '../../../store/output-store.js';
import { TARGET_LABELS } from '../../../components/codegen-ui.js';
import { useStudioToast } from '../../../components/StudioToastProvider.js';
import { withInstrumentation } from '../../../services/instrumentation/core.js';
import { ExportSelectionPanel } from '../../panels/ExportSelectionPanel.js';
import { ExportPreviewPanel } from '../../panels/ExportPreviewPanel.js';
import { downloadExportArtifact } from '../../../services/export-artifact.js';
import { useExportWorkbenchStore } from '../../../store/export-workbench-store.js';

export interface ExportPerspectiveProps {
  /**
   * Workspace files forwarded from EditorPage via PerspectiveHost.
   * Used by the Download flow to POST to /api/codegen.
   */
  files?: ReadonlyArray<WorkspaceFile>;
  /** Stable workspace identity for artifact ownership. */
  workspaceId?: string;
}

export const ExportPerspective = withInstrumentation(
  function ExportPerspective({ files, workspaceId }: ExportPerspectiveProps): ReactElement {
    const activeTarget = useCodegenStore((s) => s.activeTarget);
    const setActiveTarget = useCodegenStore((s) => s.setActiveTarget);
    const setCodePreviewTarget = useCodegenStore((s) => s.setCodePreviewTarget);
    const snapshot = useCodegenStore((s) => s.snapshot);
    const dependencyGraph = useCodegenStore((s) => s.dependencyGraph);
    const namespaceList = useMemo(() => Object.keys(dependencyGraph).sort(), [dependencyGraph]);

    const { showToast } = useStudioToast();

    // Download modal state (mirrors CodePreviewPanel's download flow).
    const [downloadModalTarget, setDownloadModalTarget] = useState<Target | undefined>(undefined);
    const [downloadingTarget, setDownloadingTarget] = useState<Target | undefined>(undefined);
    const [exportSelection, setExportSelection] = useState<ExportSelection>({ namespaces: [], declarations: [] });
    const exportRun = useExportWorkbenchStore((state) => state.run);
    const generateArtifact = useExportWorkbenchStore((state) => state.generate);
    const invalidateArtifact = useExportWorkbenchStore((state) => state.invalidate);
    const sourceFingerprint = useMemo(
      () => JSON.stringify((files ?? []).map((file) => [file.path, file.content, file.serializedModelJson])),
      [files]
    );
    const [sourceRevision, setSourceRevision] = useState(0);

    useEffect(() => {
      setSourceRevision((previous) => {
        const revision = previous + 1;
        invalidateArtifact(revision);
        return revision;
      });
    }, [invalidateArtifact, sourceFingerprint]);

    const handleView = useCallback(
      (target: Target) => {
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
        const fileList = files ?? [];
        const hasUserFiles = fileList.some((f) => !f.readOnly);
        const hasCurated = collectCuratedBundlesFromWorkspace(fileList).length > 0;
        if (!hasUserFiles && !hasCurated) {
          console.warn(
            '[ExportPerspective] Download skipped — workspace has no user files and no curated bundles for target:',
            target
          );
          return;
        }
        setDownloadModalTarget(target);
      },
      [files]
    );

    const handleModalGenerate = useCallback(
      async (config: DownloadConfig) => {
        const newTarget = config.target;
        setDownloadModalTarget(undefined);
        const fileList = files ?? [];
        const requestFiles: Array<{ path: string; content: string }> = [];
        for (const f of fileList) {
          if (f.readOnly) continue;
          requestFiles.push({ path: f.path, content: f.content });
        }
        const { curatedBundles, curatedDocs } = collectCuratedSourcesForCodegen(fileList);
        const targetOptions = (config.options?.[newTarget] ?? {}) as Record<string, unknown>;
        const layoutOption = config.layout ? { layout: config.layout } : {};
        const options = config.layout || config.options ? { [newTarget]: { ...targetOptions, ...layoutOption } } : {};
        setDownloadingTarget(newTarget);
        try {
          if (config.selection) {
            await generateArtifact({
              workspaceId: workspaceId ?? 'unsaved-workspace',
              sourceRevision,
              config: { target: newTarget, selection: config.selection, options },
              files: fileList
            });
            return;
          }
          await downloadTargetViaRouter(
            requestFiles,
            newTarget,
            options,
            curatedBundles,
            config.selection ? [] : config.namespaces,
            curatedDocs,
            config.selection
          );
        } catch (err) {
          if (err instanceof CodegenDownloadError) {
            const detail = err.diagnostics.length > 0 ? err.diagnostics.map((d) => d.message).join('; ') : err.message;
            showToast({ title: 'Code generation failed', description: detail, variant: 'destructive' });
            useOutputStore.getState().addLine(fmtLine('codegen', err.message), 'error');
            err.diagnostics.forEach((d) =>
              useOutputStore
                .getState()
                .addLine(fmtLine('codegen', d.message, d.code), d.severity === 'error' ? 'error' : 'warn')
            );
            console.error(
              `[ExportPerspective] /api/codegen ${err.status} for target ${newTarget}: ${err.message}`,
              err.diagnostics
            );
          } else {
            const msg = err instanceof Error ? err.message : 'Unexpected error during download.';
            showToast({ title: 'Download failed', description: msg, variant: 'destructive' });
            useOutputStore.getState().addLine(fmtLine('codegen', msg), 'error');
            console.error('[ExportPerspective] Download failed for target', newTarget, err);
          }
        } finally {
          setDownloadingTarget(undefined);
        }
      },
      [files, generateArtifact, sourceRevision, workspaceId, showToast]
    );

    // Derive read-only preview content from the store snapshot.
    const activeContent = useMemo(() => {
      if (snapshot.status !== 'ready' && snapshot.status !== 'stale') return undefined;
      const file = snapshot.files.find((f) => f.relativePath === snapshot.activeRelativePath) ?? snapshot.files[0];
      return file?.content;
    }, [snapshot]);

    const previewLabel = useMemo(() => {
      if (!activeTarget) return undefined;
      return TARGET_LABELS[activeTarget];
    }, [activeTarget]);

    // overflow-hidden (not auto): the targets table and the preview <pre>
    // each own their scrolling — an outer scrollbar would double up.
    return (
      <section data-testid="export-perspective" className="h-full overflow-hidden flex flex-col">
        <div className="flex flex-col flex-1 min-h-0">
          <div className="grid shrink-0 border-b border-border lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
            <ExportSelectionPanel selection={exportSelection} onChange={setExportSelection} />
            {/* Target settings remain visible while the selection changes. */}
            <div
              data-testid="export-targets-section"
              className="min-w-0 border-t border-border lg:border-l lg:border-t-0"
            >
              <CodegenTargetsTable
                onView={handleView}
                onDownload={handleDownload}
                inflightTarget={downloadingTarget}
                activeTarget={activeTarget}
              />
            </div>
          </div>

          {/* Captured focused-export preview, or the existing general code preview. */}
          {exportRun.status !== 'idle' ? (
            <div className="min-h-0 flex-1">
              <ExportPreviewPanel
                run={exportRun}
                onDownload={() => {
                  if (exportRun.status === 'ready') downloadExportArtifact(exportRun.artifact);
                }}
              />
            </div>
          ) : activeTarget !== undefined ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Toolbar */}
              <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-border/70 bg-card/40">
                {previewLabel && (
                  <span className="text-sm font-medium text-foreground" data-testid="export-active-target">
                    {previewLabel}
                  </span>
                )}
                <div className="ml-auto text-right">
                  {snapshot.status === 'waiting' && (
                    <span
                      className="block text-xs text-muted-foreground"
                      data-testid="export-preview-status"
                      aria-live="polite"
                    >
                      Generating…
                    </span>
                  )}
                  {snapshot.status === 'unavailable' && (
                    <span
                      className="block text-xs text-muted-foreground"
                      data-testid="export-preview-status"
                      aria-live="polite"
                    >
                      Preview unavailable — reload Studio
                    </span>
                  )}
                  {(snapshot.status === 'ready' || snapshot.status === 'stale') && (
                    <span
                      className="block text-xs text-muted-foreground"
                      data-testid="export-preview-status"
                      aria-live="polite"
                    >
                      {snapshot.status === 'stale' ? 'Outdated — fix errors to refresh' : `Generated (${previewLabel})`}
                    </span>
                  )}
                </div>
              </div>

              {/* Content */}
              {activeContent !== undefined ? (
                <pre
                  // Keyed on the target so switching targets fades the new
                  // output in instead of popping.
                  key={activeTarget}
                  data-testid="export-preview-content"
                  className="studio-fade-in studio-scroll flex-1 overflow-auto p-3 text-xs font-mono text-foreground bg-card/20 whitespace-pre"
                >
                  {activeContent}
                </pre>
              ) : (
                <div
                  data-testid="export-preview-empty"
                  className="flex-1 flex items-center justify-center px-6 py-8 text-center"
                >
                  <p className="text-xs text-muted-foreground max-w-[22rem]">
                    {snapshot.status === 'waiting'
                      ? 'Generating preview…'
                      : 'Select a target above to generate a preview.'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div
              data-testid="export-preview-empty"
              className="flex-1 flex items-center justify-center px-6 py-8 text-center"
            >
              <p className="text-xs text-muted-foreground max-w-[22rem]">
                Select a target above to generate a preview.
              </p>
            </div>
          )}
        </div>

        {downloadModalTarget !== undefined ? (
          <DownloadConfigDialog
            open
            target={downloadModalTarget}
            namespaces={namespaceList}
            dependencyGraph={dependencyGraph}
            selection={exportSelection}
            onClose={() => setDownloadModalTarget(undefined)}
            onGenerate={handleModalGenerate}
            optionsForm={downloadModalTarget === 'excel' ? ExcelOptionsFormAdapter : undefined}
          />
        ) : null}
      </section>
    );
  },
  { op: 'ExportPerspective' }
);
