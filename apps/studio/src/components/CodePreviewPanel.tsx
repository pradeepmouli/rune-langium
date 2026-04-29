// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import type { Target } from '@rune-langium/codegen';
import { refactoryDark } from '../lang/refactory-dark-theme.js';
import { TargetSwitcher } from './TargetSwitcher.js';
import {
  useCodegenStore,
  type CodePreviewFile,
  type CodePreviewSnapshot
} from '../store/codegen-store.js';
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
}

function activeFileFromSnapshot(snapshot: CodePreviewSnapshot): CodePreviewFile | undefined {
  if (!('files' in snapshot) || !snapshot.files) {
    return undefined;
  }
  return (
    snapshot.files.find((file) => file.relativePath === snapshot.activeRelativePath) ??
    snapshot.files[0]
  );
}

export function CodePreviewPanel({
  worker,
  sourceEditorRef
}: CodePreviewPanelProps): React.ReactElement {
  const target = useCodegenStore((s) => s.codePreviewTarget);
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
      if (
        msg.target !== currentTargetRef.current ||
        msg.requestId !== currentRequestIdRef.current
      ) {
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

  useEffect(() => {
    requestGeneration(target);
  }, [requestGeneration, target]);

  const handleTargetChange = useCallback(
    (newTarget: Target) => {
      setCodePreviewTarget(newTarget);
    },
    [setCodePreviewTarget]
  );

  const handleLineClick = useCallback((outputLine: number) => {
    const ref = sourceEditorRefRef.current;
    const file = activeFileRef.current;
    if (!ref || !file) return;
    const entry = file.sourceMap.find((sourceMapEntry) => sourceMapEntry.outputLine === outputLine);
    if (!entry) return;
    ref.revealPosition(
      { line: entry.sourceLine, character: entry.sourceChar },
      uriToPath(entry.sourceUri)
    );
  }, []);

  useEffect(() => {
    if (!editorContainerRef.current) return;

    const state = EditorState.create({
      doc: '',
      extensions: [
        basicSetup,
        EditorState.readOnly.of(true),
        EditorView.lineWrapping,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const statusMessage =
    snapshot.status === 'stale' || snapshot.status === 'unavailable' ? snapshot.message : undefined;
  const selectableFiles =
    snapshot.status === 'ready' || snapshot.status === 'stale' ? snapshot.files : undefined;
  const activeRelativePath =
    snapshot.status === 'ready' || snapshot.status === 'stale'
      ? snapshot.activeRelativePath
      : undefined;

  return (
    <section
      id={CODE_PREVIEW_PANEL_ID}
      role="tabpanel"
      aria-label="Code preview"
      aria-labelledby={`codegen-tab-${target}`}
      data-testid="panel-codePreview"
      data-component="workspace.codePreview"
      className="flex flex-col h-full overflow-hidden bg-background"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5 shrink-0">
        <TargetSwitcher value={target} onChange={handleTargetChange} />
        {selectableFiles && selectableFiles.length > 1 ? (
          <label className="min-w-0 text-xs text-muted-foreground">
            <span className="sr-only">Generated file</span>
            <select
              className="max-w-[18rem] rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
              value={activeRelativePath}
              onChange={(event) => setActiveCodePreviewFile(event.target.value)}
              data-testid="codegen-file-select"
            >
              {selectableFiles.map((file) => (
                <option key={file.relativePath} value={file.relativePath}>
                  {file.relativePath}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="ml-auto min-w-0 text-right">
          <span
            className="block text-xs text-muted-foreground"
            data-testid="codegen-status"
            aria-live="polite"
          >
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
            <span className="block max-w-[22rem] truncate text-[11px] text-muted-foreground">
              {statusMessage}
            </span>
          ) : null}
        </div>
      </div>
      <div
        ref={editorContainerRef}
        data-testid="code-preview-editor"
        className="min-w-0 flex-1 overflow-auto"
      />
    </section>
  );
}
