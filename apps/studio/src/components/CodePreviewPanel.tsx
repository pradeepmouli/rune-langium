// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import type { Target } from '@rune-langium/codegen';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rune-langium/design-system/ui/select';
import { refactoryDark } from '../lang/refactory-dark-theme.js';
import {
  downloadTargetViaRouter,
  CodegenDownloadError,
  collectCuratedBundlesFromWorkspace,
  type WorkspaceFile
} from '../services/workspace.js';
import { CodegenTargetsTable } from './CodegenTargetsTable.js';
import { useCodegenStore, type CodePreviewFile, type CodePreviewSnapshot } from '../store/codegen-store.js';
import { usePreviewStore } from '../store/preview-store.js';
import { CODE_PREVIEW_PANEL_ID, TARGET_LABELS } from './codegen-ui.js';
import { uriToPath } from '../utils/uri.js';

interface SourcePosition {
  line: number;
  character: number;
}

export interface SourceEditorHandle {
  revealPosition(position: SourcePosition, filePath?: string): void;
}

interface CodegenResultMessage {
  type: 'codegen:result';
  target: Target;
  requestId: string;
  files: CodePreviewFile[];
}

interface CodegenOutdatedMessage {
  type: 'codegen:outdated';
  target: Target;
  requestId: string;
  message: string;
}

interface CodegenErrorMessage {
  type: 'codegen:error';
  target: Target;
  requestId: string;
  message: string;
}

type CodegenWorkerMessage = CodegenResultMessage | CodegenOutdatedMessage | CodegenErrorMessage;

function statusLabel(snapshot: CodePreviewSnapshot, target: Target): string {
  switch (snapshot.status) {
    case 'waiting':
      return 'Generating…';
    case 'ready':
      return `Generated (${TARGET_LABELS[target]})`;
    case 'stale':
      return 'Outdated — fix errors to refresh';
    case 'unavailable':
      return 'Preview unavailable — reload Studio';
    default: {
      const exhaustiveCheck: never = snapshot;
      throw new Error(`Unknown code preview status: ${String(exhaustiveCheck)}`);
    }
  }
}

export interface CodePreviewPanelProps {
  worker: Worker;
  sourceEditorRef: SourceEditorHandle | null;
  /**
   * Workspace files (user-authored only — curated bundles are
   * server-loaded). Used by the Download flow (018 Task 0.12) to
   * POST `{ files, target }` to `/api/codegen`. Optional during the
   * transition; absent → Download is disabled and logs a warning.
   */
  files?: ReadonlyArray<WorkspaceFile>;
}

function activeFileFromSnapshot(snapshot: CodePreviewSnapshot): CodePreviewFile | undefined {
  if (!('files' in snapshot) || !snapshot.files) {
    return undefined;
  }
  return snapshot.files.find((file) => file.relativePath === snapshot.activeRelativePath) ?? snapshot.files[0];
}

export function CodePreviewPanel({ worker, sourceEditorRef, files }: CodePreviewPanelProps): React.ReactElement {
  const target = useCodegenStore((s) => s.codePreviewTarget);
  const activeTarget = useCodegenStore((s) => s.activeTarget);
  const setActiveTarget = useCodegenStore((s) => s.setActiveTarget);
  const currentRequestId = useCodegenStore((s) => s.currentRequestId);
  const beginCodePreviewRequest = useCodegenStore((s) => s.beginCodePreviewRequest);
  const snapshot = useCodegenStore((s) => s.snapshot);
  const setCodePreviewTarget = useCodegenStore((s) => s.setCodePreviewTarget);
  const setActiveCodePreviewFile = useCodegenStore((s) => s.setActiveCodePreviewFile);
  const receiveCodePreviewResult = useCodegenStore((s) => s.receiveCodePreviewResult);
  const markCodePreviewStale = useCodegenStore((s) => s.markCodePreviewStale);
  const markCodePreviewUnavailable = useCodegenStore((s) => s.markCodePreviewUnavailable);
  const activeFile = useMemo(() => activeFileFromSnapshot(snapshot), [snapshot]);

  const currentTargetRef = useRef<Target>(target);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const sourceEditorRefRef = useRef(sourceEditorRef);
  const activeFileRef = useRef<CodePreviewFile | undefined>(undefined);
  sourceEditorRefRef.current = sourceEditorRef;
  activeFileRef.current = activeFile;

  currentTargetRef.current = target;
  const currentRequestIdRef = useRef(currentRequestId);
  currentRequestIdRef.current = currentRequestId;

  const requestGeneration = useCallback(
    (requestedTarget: Target) => {
      const requestId = beginCodePreviewRequest(requestedTarget);
      try {
        worker.postMessage({ type: 'codegen:generate', target: requestedTarget, requestId });
      } catch (err) {
        console.error('[CodePreviewPanel] Failed to request code generation:', err);
        markCodePreviewUnavailable({
          target: requestedTarget,
          message: 'Code preview worker is unavailable.'
        });
      }
    },
    [beginCodePreviewRequest, markCodePreviewUnavailable, worker]
  );

  useEffect(() => {
    function handleMessage(e: MessageEvent<CodegenWorkerMessage>) {
      const msg = e.data;
      if (msg.target !== currentTargetRef.current || msg.requestId !== currentRequestIdRef.current) {
        return;
      }
      switch (msg.type) {
        case 'codegen:result':
          receiveCodePreviewResult({ target: msg.target, files: msg.files });
          break;
        case 'codegen:outdated':
          markCodePreviewStale({ target: msg.target, message: msg.message });
          break;
        case 'codegen:error':
          markCodePreviewUnavailable({ target: msg.target, message: msg.message });
          break;
      }
    }

    function handleWorkerError(event: ErrorEvent) {
      console.error('[CodePreviewPanel] Worker error:', event.message, event.error);
      markCodePreviewUnavailable({
        target: currentTargetRef.current,
        message: 'Code preview worker crashed — reload Studio.'
      });
    }

    const messageListener = handleMessage as EventListener;
    const errorListener = handleWorkerError as EventListener;
    worker.addEventListener('message', messageListener);
    worker.addEventListener('error', errorListener);

    return () => {
      worker.removeEventListener('message', messageListener);
      worker.removeEventListener('error', errorListener);
    };
  }, [markCodePreviewStale, markCodePreviewUnavailable, receiveCodePreviewResult, worker]);

  // 018 Task 0.8 — only kick off codegen once the user has entered the
  // viewer for a target. When `activeTarget` is undefined the targets
  // table is shown and there is nothing to generate yet, so skipping the
  // request avoids a wasted "default zod" generation on every mount.
  useEffect(() => {
    if (activeTarget === undefined) return;
    requestGeneration(target);
  }, [activeTarget, requestGeneration, target]);

  // 019 polish — View toggles. Click the eye on the already-active row
  // collapses the preview area; click on a different row swaps it.
  const handleViewTarget = useCallback(
    (newTarget: Target) => {
      if (activeTarget === newTarget) {
        setActiveTarget(undefined);
        return;
      }
      setActiveTarget(newTarget);
      if (newTarget !== target) {
        setCodePreviewTarget(newTarget);
      }
    },
    [activeTarget, setActiveTarget, setCodePreviewTarget, target]
  );

  // 018 Task 0.12 — which target's Download is in flight, used to swap
  // its row buttons for a spinner on the targets table while the POST
  // to /api/codegen is outstanding. Panel-local state because no other
  // component needs to observe it.
  const [downloadingTarget, setDownloadingTarget] = useState<Target | undefined>(undefined);

  const handleDownloadTarget = useCallback(
    async (newTarget: Target) => {
      const fileList = files ?? [];
      const requestFiles = fileList.filter((f) => !f.readOnly).map((f) => ({ path: f.path, content: f.content }));
      // 019 Task #88 — curated bundles travel as `{ id, version }`
      // tuples; the Pages Function fetches them server-to-server via
      // the CURATED_MIRROR binding. A pure curated workspace (no
      // user-authored files) is a legitimate download case, so we no
      // longer bail when requestFiles is empty — only bail when the
      // workspace has neither user files nor curated bundles.
      const curatedBundles = collectCuratedBundlesFromWorkspace(fileList);
      if (requestFiles.length === 0 && curatedBundles.length === 0) {
        console.warn(
          '[CodePreviewPanel] Download skipped — workspace has no user files and no curated bundles for target:',
          newTarget
        );
        return;
      }
      setDownloadingTarget(newTarget);
      try {
        await downloadTargetViaRouter(requestFiles, newTarget, {}, curatedBundles);
      } catch (err) {
        if (err instanceof CodegenDownloadError) {
          console.error(
            `[CodePreviewPanel] /api/codegen ${err.status} for target ${newTarget}: ${err.message}`,
            err.diagnostics
          );
        } else {
          console.error('[CodePreviewPanel] Download failed for target', newTarget, err);
        }
      } finally {
        setDownloadingTarget(undefined);
      }
    },
    [files]
  );

  const handleLineClick = useCallback((outputLine: number) => {
    const ref = sourceEditorRefRef.current;
    const file = activeFileRef.current;
    if (!ref || !file) return;
    const entry = file.sourceMap.find((sourceMapEntry) => sourceMapEntry.outputLine === outputLine);
    if (!entry) return;
    ref.revealPosition({ line: entry.sourceLine, character: entry.sourceChar }, uriToPath(entry.sourceUri));
  }, []);

  // 018 Task 0.8 — `activeTarget` is a dep so the editor mounts on the
  // first transition from the targets-table view (where the container
  // ref is absent) to the viewer (where it exists), even when `target`
  // didn't change because the user clicked View on the current default.
  useEffect(() => {
    if (!editorContainerRef.current) return;

    const langExtension = target === 'json-schema' ? json() : javascript({ typescript: true });

    const state = EditorState.create({
      doc: '',
      extensions: [
        basicSetup,
        EditorState.readOnly.of(true),
        EditorView.lineWrapping,
        langExtension,
        ...refactoryDark,
        EditorView.domEventHandlers({
          click: (event, view) => {
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (pos === null) return;
            const lineNumber = view.state.doc.lineAt(pos).number - 1;
            handleLineClick(lineNumber);
          }
        })
      ]
    });

    const view = new EditorView({ state, parent: editorContainerRef.current });
    editorViewRef.current = view;

    return () => {
      view.destroy();
      editorViewRef.current = null;
    };
  }, [activeTarget, handleLineClick, target]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;
    const nextContent = activeFile?.content ?? '';
    const current = view.state.doc.toString();
    if (current === nextContent) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: nextContent }
    });
  }, [activeFile]);

  const selectedTargetId = usePreviewStore((s) => s.selectedTargetId);
  useEffect(() => {
    const view = editorViewRef.current;
    if (!view || !selectedTargetId || !activeFile) return;
    const typeName = selectedTargetId.split('.').pop();
    if (!typeName) return;
    const lines = activeFile.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i]!.trimStart();
      if (trimmed.includes(typeName) && /^(export |const |class |interface |type |function )/.test(trimmed)) {
        const lineInfo = view.state.doc.line(i + 1);
        view.dispatch({
          effects: EditorView.scrollIntoView(lineInfo.from, { y: 'start', yMargin: 40 })
        });
        return;
      }
    }
  }, [selectedTargetId, activeFile]);

  const statusMessage = snapshot.status === 'stale' || snapshot.status === 'unavailable' ? snapshot.message : undefined;
  const selectableFiles = snapshot.status === 'ready' || snapshot.status === 'stale' ? snapshot.files : undefined;
  const activeRelativePath =
    snapshot.status === 'ready' || snapshot.status === 'stale' ? snapshot.activeRelativePath : undefined;

  // 019 polish — stacked layout: targets table always at the top; when
  // `activeTarget` is set, the viewer expands below it. Clicking the
  // eye icon on a row toggles its preview open/closed. `inflightTarget`
  // reflects the in-flight Download POST (Task 0.12) so the clicked
  // row shows a spinner while `/api/codegen` is outstanding.
  const viewerOpen = activeTarget !== undefined;
  return (
    <section
      id={CODE_PREVIEW_PANEL_ID}
      role={viewerOpen ? 'tabpanel' : undefined}
      aria-label={viewerOpen ? 'Code preview' : 'Code preview targets'}
      data-testid="panel-codePreview"
      data-component="workspace.codePreview"
      className="preview-panel preview-panel--code flex h-full min-h-0 flex-col overflow-hidden"
    >
      <div className="shrink-0 border-b border-border/70">
        <CodegenTargetsTable
          onView={handleViewTarget}
          onDownload={handleDownloadTarget}
          inflightTarget={downloadingTarget}
          activeTarget={activeTarget}
        />
      </div>
      {viewerOpen ? (
        <>
          <div className="preview-panel__toolbar flex shrink-0 flex-wrap items-center gap-2 border-b border-border/70 bg-card/40 px-3 py-1.5">
            <span className="text-sm font-medium text-foreground" data-testid="codegen-active-target">
              {TARGET_LABELS[activeTarget!]}
            </span>
            {selectableFiles && selectableFiles.length > 1 ? (
              <Select value={activeRelativePath} onValueChange={(value) => setActiveCodePreviewFile(value)}>
                <SelectTrigger
                  size="sm"
                  aria-label="Generated file"
                  data-testid="codegen-file-select"
                  className="max-w-[18rem] text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {selectableFiles.map((file) => (
                    <SelectItem key={file.relativePath} value={file.relativePath} className="text-xs">
                      {file.relativePath}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <div className="ml-auto min-w-0 text-right">
              <span className="block text-xs text-muted-foreground" data-testid="codegen-status" aria-live="polite">
                {statusLabel(snapshot, target)}
              </span>
              {activeFile?.relativePath ? (
                <span
                  className="block max-w-[22rem] truncate text-[11px] text-muted-foreground"
                  data-testid="codegen-relative-path"
                  title={activeFile.relativePath}
                >
                  {activeFile.relativePath}
                </span>
              ) : null}
              {statusMessage ? (
                <span className="block max-w-[22rem] truncate text-[11px] text-muted-foreground">{statusMessage}</span>
              ) : null}
            </div>
          </div>
          <div
            ref={editorContainerRef}
            data-testid="code-preview-editor"
            className="preview-panel__editor min-w-0 flex-1 overflow-auto"
          />
        </>
      ) : null}
    </section>
  );
}
