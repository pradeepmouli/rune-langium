// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/** Declaration-scoped export workbench: roots, settings, then captured output. */

import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExportSelection } from '@rune-langium/codegen/export';
import type { WorkbenchDefinition } from '../../workbench-types.js';
import { WorkbenchHost } from '../../WorkbenchHost.js';
import type { WorkspaceFile } from '../../../services/workspace.js';
import { downloadExportArtifact } from '../../../services/export-artifact.js';
import { withInstrumentation } from '../../../services/instrumentation/core.js';
import { useExportWorkbenchStore } from '../../../store/export-workbench-store.js';
import { exportSourceFingerprint } from '../../../services/export-request.js';
import { useExportNavigationStore } from '../../../services/export-navigation.js';
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
    const nativeLayout = useExportWorkbenchStore((state) => state.nativeLayout);
    const activate = useExportWorkbenchStore((state) => state.activate);
    const configure = useExportWorkbenchStore((state) => state.configure);
    const generate = useExportWorkbenchStore((state) => state.generate);
    const cancel = useExportWorkbenchStore((state) => state.cancel);
    const invalidate = useExportWorkbenchStore((state) => state.invalidate);
    const setActiveFile = useExportWorkbenchStore((state) => state.setActiveFile);
    const setNativeLayout = useExportWorkbenchStore((state) => state.setNativeLayout);
    const [sourceRevision, setSourceRevision] = useState(0);
    const [activationReady, setActivationReady] = useState(false);
    const sourceRevisionRef = useRef(sourceRevision);
    const activationRef = useRef<{ workspaceId: string; promise: Promise<void> } | undefined>(undefined);
    const requiredBy = useMemo(
      () =>
        new Map(
          Object.entries(run.status === 'ready' ? (run.artifact.manifest.resolvedSelection?.requiredBy ?? {}) : {})
        ),
      [run]
    );
    const sourceFingerprint = useMemo(() => exportSourceFingerprint(workspaceId, files ?? []), [files, workspaceId]);

    useEffect(() => {
      if (!workspaceId) {
        setActivationReady(false);
        return;
      }
      if (activationRef.current?.workspaceId !== workspaceId) {
        setActivationReady(false);
        activationRef.current = { workspaceId, promise: activate(workspaceId) };
      }
      let cancelled = false;
      void activationRef.current.promise.then(() => {
        if (cancelled) return;
        const intent = useExportNavigationStore.getState().consume(workspaceId);
        if (intent) configure({ ...useExportWorkbenchStore.getState().config, selection: intent.selection });
        setActivationReady(true);
      });
      return () => {
        cancelled = true;
      };
    }, [activate, configure, workspaceId]);
    useEffect(() => {
      const revision = sourceRevisionRef.current + 1;
      sourceRevisionRef.current = revision;
      setSourceRevision(revision);
      invalidate(revision);
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
    const definition = useMemo<WorkbenchDefinition>(
      () => ({
        id: 'export',
        panels: {
          'export.selection': () => (
            <div data-testid="export-selection" className="h-full min-h-0">
              <ExportSelectionPanel
                selection={config.selection}
                requiredBy={requiredBy}
                included={run.status === 'ready' ? run.artifact.manifest.resolvedSelection?.included : undefined}
                includedCount={
                  run.status === 'ready' ? run.artifact.manifest.resolvedSelection?.included.length : undefined
                }
                onChange={handleSelectionChange}
              />
            </div>
          ),
          'export.settings': () => (
            <div data-testid="export-settings" className="h-full min-h-0">
              <ExportSettingsPanel
                config={config}
                onChange={configure}
                onGenerate={handleGenerate}
                onCancel={cancel}
                status={run.status}
              />
            </div>
          ),
          'export.preview': () => (
            <div data-testid="export-preview" className="h-full min-h-0">
              <ExportPreviewPanel
                run={run}
                activeFile={activeFile}
                onActiveFileChange={setActiveFile}
                onDownload={() => {
                  if (run.status === 'ready') downloadExportArtifact(run.artifact);
                }}
              />
            </div>
          )
        },
        titles: {
          'export.selection': 'Selection',
          'export.settings': 'Settings',
          'export.preview': 'Generated output'
        },
        buildDefault(api, width) {
          const selection = api.addPanel({
            id: 'export.selection',
            component: 'export.selection',
            title: 'Selection'
          });
          const settings = api.addPanel({
            id: 'export.settings',
            component: 'export.settings',
            title: 'Settings',
            position:
              width < 768
                ? { referenceGroup: selection.group, direction: 'within' }
                : { referencePanel: selection.id, direction: 'right' }
          });
          const preview = api.addPanel({
            id: 'export.preview',
            component: 'export.preview',
            title: 'Generated output',
            position: { referencePanel: selection.id, direction: 'below' }
          });
          if (width >= 768) settings.group.api.setConstraints({ minimumWidth: 320 });
          preview.group.api.setConstraints({ minimumHeight: 220 });
        }
      }),
      [activeFile, cancel, config, configure, handleGenerate, handleSelectionChange, requiredBy, run, setActiveFile]
    );

    return (
      <section data-testid="export-perspective" className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="min-h-0 flex-1">
          {activationReady ? (
            <WorkbenchHost
              definition={definition}
              initialNativeLayout={nativeLayout}
              onNativeLayoutChange={setNativeLayout}
              className="h-full min-w-0 w-full"
            />
          ) : (
            <p role="status" className="p-3 text-sm text-muted-foreground">
              Restoring Export workspace…
            </p>
          )}
        </div>
      </section>
    );
  },
  { op: 'ExportPerspective' }
);
