// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/** Declaration-scoped export workbench: roots, settings, then captured output. */

import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ExportSelection } from '@rune-langium/codegen/export';
import type { WorkspaceFile } from '../../../services/workspace.js';
import { downloadExportArtifact } from '../../../services/export-artifact.js';
import { withInstrumentation } from '../../../services/instrumentation/core.js';
import { useExportWorkbenchStore } from '../../../store/export-workbench-store.js';
import { ExportSelectionPanel } from '../../panels/ExportSelectionPanel.js';
import { ExportSettingsPanel } from '../../panels/ExportSettingsPanel.js';
import { ExportPreviewPanel } from '../../panels/ExportPreviewPanel.js';

export interface ExportPerspectiveProps {
  files?: ReadonlyArray<WorkspaceFile>;
  /** Stable workspace identity for artifact ownership and settings persistence. */
  workspaceId?: string;
}

export const ExportPerspective = withInstrumentation(
  function ExportPerspective({ files, workspaceId }: ExportPerspectiveProps): ReactElement {
    const config = useExportWorkbenchStore((state) => state.config);
    const run = useExportWorkbenchStore((state) => state.run);
    const activeFile = useExportWorkbenchStore((state) => state.activeFile);
    const activate = useExportWorkbenchStore((state) => state.activate);
    const configure = useExportWorkbenchStore((state) => state.configure);
    const generate = useExportWorkbenchStore((state) => state.generate);
    const cancel = useExportWorkbenchStore((state) => state.cancel);
    const invalidate = useExportWorkbenchStore((state) => state.invalidate);
    const setActiveFile = useExportWorkbenchStore((state) => state.setActiveFile);
    const [sourceRevision, setSourceRevision] = useState(0);
    const sourceFingerprint = useMemo(
      () =>
        JSON.stringify([workspaceId, (files ?? []).map((file) => [file.path, file.content, file.serializedModelJson])]),
      [files, workspaceId]
    );

    useEffect(() => {
      if (workspaceId) void activate(workspaceId);
    }, [activate, workspaceId]);
    useEffect(() => {
      setSourceRevision((previous) => {
        const revision = previous + 1;
        invalidate(revision);
        return revision;
      });
    }, [invalidate, sourceFingerprint]);

    const handleSelectionChange = useCallback(
      (selection: ExportSelection) => configure({ ...config, selection }),
      [config, configure]
    );
    const handleGenerate = useCallback(() => {
      void generate({
        workspaceId: workspaceId ?? 'unsaved-workspace',
        sourceRevision,
        config,
        files: files ?? []
      });
    }, [config, files, generate, sourceRevision, workspaceId]);

    return (
      <section data-testid="export-perspective" className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="grid shrink-0 border-b border-border lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
          <div data-testid="export-selection" className="min-w-0">
            <ExportSelectionPanel selection={config.selection} onChange={handleSelectionChange} />
          </div>
          <div data-testid="export-settings" className="min-w-0 border-t border-border lg:border-l lg:border-t-0">
            <ExportSettingsPanel
              config={config}
              onChange={configure}
              onGenerate={handleGenerate}
              onCancel={cancel}
              status={run.status}
            />
          </div>
        </div>
        <div data-testid="export-preview" className="min-h-0 flex-1">
          <ExportPreviewPanel
            run={run}
            activeFile={activeFile}
            onActiveFileChange={setActiveFile}
            onDownload={() => {
              if (run.status === 'ready') downloadExportArtifact(run.artifact);
            }}
          />
        </div>
      </section>
    );
  },
  { op: 'ExportPerspective' }
);
