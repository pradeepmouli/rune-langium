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
 *   - Download — opens `DownloadConfigModal` and calls `downloadTargetViaRouter`
 *     (the same client-side /api/codegen route used by CodePreviewPanel).
 *   - Empty state — shown when no snapshot is available yet.
 */

import type { ReactElement } from 'react';
import { useCallback, useMemo, useState } from 'react';
import type { Target } from '@rune-langium/codegen';
import { CodegenTargetsTable } from '../../../components/CodegenTargetsTable.js';
import { DownloadConfigModal, type DownloadConfig } from '../../../components/DownloadConfigModal.js';
import { ExcelOptionsFormAdapter } from '../../../codegen-forms/ExcelOptionsFormAdapter.js';
import {
  downloadTargetViaRouter,
  CodegenDownloadError,
  collectCuratedBundlesFromWorkspace,
  type WorkspaceFile
} from '../../../services/workspace.js';
import { useCodegenStore } from '../../../store/codegen-store.js';
import { TARGET_LABELS } from '../../../components/codegen-ui.js';

export interface ExportPerspectiveProps {
  /**
   * Workspace files forwarded from EditorPage via PerspectiveHost.
   * Used by the Download flow to POST to /api/codegen.
   */
  files?: ReadonlyArray<WorkspaceFile>;
}

export function ExportPerspective({ files }: ExportPerspectiveProps): ReactElement {
  const activeTarget = useCodegenStore((s) => s.activeTarget);
  const setActiveTarget = useCodegenStore((s) => s.setActiveTarget);
  const setCodePreviewTarget = useCodegenStore((s) => s.setCodePreviewTarget);
  const snapshot = useCodegenStore((s) => s.snapshot);
  const dependencyGraph = useCodegenStore((s) => s.dependencyGraph);
  const namespaceList = useMemo(() => Object.keys(dependencyGraph).sort(), [dependencyGraph]);

  // Download modal state (mirrors CodePreviewPanel's download flow).
  const [downloadModalTarget, setDownloadModalTarget] = useState<Target | undefined>(undefined);
  const [downloadingTarget, setDownloadingTarget] = useState<Target | undefined>(undefined);

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
      const requestFiles = fileList.filter((f) => !f.readOnly).map((f) => ({ path: f.path, content: f.content }));
      const curatedBundles = collectCuratedBundlesFromWorkspace(fileList);
      const targetOptions = (config.options?.[newTarget] ?? {}) as Record<string, unknown>;
      const layoutOption = config.layout ? { layout: config.layout } : {};
      const options =
        config.layout || config.options ? { [newTarget]: { ...targetOptions, ...layoutOption } } : {};
      setDownloadingTarget(newTarget);
      try {
        await downloadTargetViaRouter(requestFiles, newTarget, options, curatedBundles, config.namespaces);
      } catch (err) {
        if (err instanceof CodegenDownloadError) {
          console.error(
            `[ExportPerspective] /api/codegen ${err.status} for target ${newTarget}: ${err.message}`,
            err.diagnostics
          );
        } else {
          console.error('[ExportPerspective] Download failed for target', newTarget, err);
        }
      } finally {
        setDownloadingTarget(undefined);
      }
    },
    [files]
  );

  // Derive read-only preview content from the store snapshot.
  const activeContent = useMemo(() => {
    if (snapshot.status !== 'ready' && snapshot.status !== 'stale') return undefined;
    const file =
      snapshot.files.find((f) => f.relativePath === snapshot.activeRelativePath) ?? snapshot.files[0];
    return file?.content;
  }, [snapshot]);

  const previewLabel = useMemo(() => {
    if (!activeTarget) return undefined;
    return TARGET_LABELS[activeTarget];
  }, [activeTarget]);

  return (
    <section data-testid="export-perspective" className="h-full overflow-auto flex flex-col">
      <div className="shrink-0 px-6 py-4 border-b border-border/70">
        <h1 className="text-lg font-semibold">Export</h1>
      </div>

      <div className="flex flex-col flex-1 min-h-0">
        {/* Target selector — always visible */}
        <div data-testid="export-targets-section" className="shrink-0">
          <CodegenTargetsTable
            onView={handleView}
            onDownload={handleDownload}
            inflightTarget={downloadingTarget}
            activeTarget={activeTarget}
          />
        </div>

        {/* Read-only preview area */}
        {activeTarget !== undefined ? (
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
                data-testid="export-preview-content"
                className="flex-1 overflow-auto p-3 text-xs font-mono text-foreground bg-card/20 whitespace-pre"
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
        <DownloadConfigModal
          open
          target={downloadModalTarget}
          namespaces={namespaceList}
          dependencyGraph={dependencyGraph}
          onClose={() => setDownloadModalTarget(undefined)}
          onGenerate={handleModalGenerate}
          optionsForm={downloadModalTarget === 'excel' ? ExcelOptionsFormAdapter : undefined}
        />
      ) : null}
    </section>
  );
}
