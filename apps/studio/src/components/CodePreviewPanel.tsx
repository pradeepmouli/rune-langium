// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { refactoryDark } from '../lang/refactory-dark-theme.js';
import type { Target, SourceMapEntry } from '@rune-langium/codegen';
import { TargetSwitcher } from './TargetSwitcher.js';
import { useCodegenStore } from '../store/codegen-store.js';
import { CODE_PREVIEW_PANEL_ID, TARGET_LABELS } from './codegen-ui.js';

interface SourcePosition {
  line: number;
  character: number;
}

export interface SourceEditorHandle {
  revealLineInCenter(line: number): void;
  setSelection(range: SourcePosition): void;
}

interface CodegenResultMessage {
  type: 'codegen:result';
  target: Target;
  relativePath: string;
  content: string;
  sourceMap: SourceMapEntry[];
}

interface CodegenOutdatedMessage {
  type: 'codegen:outdated';
}

type CodegenWorkerMessage = CodegenResultMessage | CodegenOutdatedMessage;

type Status = 'generating' | 'generated' | 'outdated' | 'unavailable';

function statusLabel(status: Status, target: Target): string {
  switch (status) {
    case 'generating':
      return 'Generating\u2026';
    case 'generated':
      return `Generated (${TARGET_LABELS[target]})`;
    case 'outdated':
      return 'Outdated \u2014 fix errors to refresh';
    case 'unavailable':
      return 'Preview unavailable \u2014 reload Studio';
    default: {
      const exhaustiveCheck: never = status;
      throw new Error(`Unknown code preview status: ${String(exhaustiveCheck)}`);
    }
  }
}

export interface CodePreviewPanelProps {
  worker: Worker;
  sourceEditorRef: SourceEditorHandle | null;
}

export function CodePreviewPanel({
  worker,
  sourceEditorRef
}: CodePreviewPanelProps): React.ReactElement {
  const target = useCodegenStore((s) => s.codePreviewTarget);
  const setCodePreviewTarget = useCodegenStore((s) => s.setCodePreviewTarget);

  const [status, setStatus] = useState<Status>('generating');
  // Retain the last successfully generated content so the panel doesn't blank on outdated
  const [lastContent, setLastContent] = useState<string>('');
  const sourceMapRef = useRef<SourceMapEntry[]>([]);
  const currentTargetRef = useRef<Target>(target);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  // Kept current so the click handler always reads the latest ref without
  // needing to be recreated (avoids rebuilding the editor extension).
  const sourceEditorRefRef = useRef(sourceEditorRef);
  sourceEditorRefRef.current = sourceEditorRef;

  const requestGeneration = useCallback(
    (requestedTarget: Target) => {
      currentTargetRef.current = requestedTarget;
      setStatus('generating');
      try {
        worker.postMessage({ type: 'codegen:generate', target: requestedTarget });
      } catch (err) {
        console.error('[CodePreviewPanel] Failed to request code generation:', err);
        setStatus('unavailable');
      }
    },
    [worker]
  );

  useEffect(() => {
    function handleMessage(e: MessageEvent<CodegenWorkerMessage>) {
      const msg = e.data;
      if (msg.type === 'codegen:result') {
        if (msg.target !== currentTargetRef.current) {
          return;
        }
        setStatus('generated');
        setLastContent(msg.content);
        sourceMapRef.current = msg.sourceMap;
      } else if (msg.type === 'codegen:outdated') {
        // Keep lastContent — show previous output with an outdated badge
        setStatus('outdated');
      }
    }

    function handleWorkerError(event: ErrorEvent) {
      console.error('[CodePreviewPanel] Worker error:', event.message, event.error);
      setStatus('unavailable');
    }

    const messageListener = handleMessage as EventListener;
    const errorListener = handleWorkerError as EventListener;
    worker.addEventListener('message', messageListener);
    worker.addEventListener('error', errorListener);

    return () => {
      worker.removeEventListener('message', messageListener);
      worker.removeEventListener('error', errorListener);
    };
  }, [requestGeneration, worker]);

  useEffect(() => {
    currentTargetRef.current = target;
    requestGeneration(target);
  }, [requestGeneration, target]);

  const handleTargetChange = useCallback(
    (newTarget: Target) => {
      setCodePreviewTarget(newTarget);
    },
    [setCodePreviewTarget]
  );

  // Click-to-navigate: map output line index -> source location via sourceMap
  const handleLineClick = useCallback(
    (outputLine: number) => {
      const ref = sourceEditorRefRef.current;
      if (!ref) return;
      const entry = sourceMapRef.current.find((e) => e.outputLine === outputLine);
      if (!entry) return;
      ref.revealLineInCenter(entry.sourceLine);
      ref.setSelection({ line: entry.sourceLine, character: entry.sourceChar });
    },
    [] // stable -- reads via refs at call time
  );

  // Create the CodeMirror editor once on mount.
  useEffect(() => {
    if (!editorContainerRef.current) return;

    const state = EditorState.create({
      doc: '',
      extensions: [
        basicSetup,
        EditorState.readOnly.of(true),
        ...refactoryDark,
        EditorView.domEventHandlers({
          click: (event, view) => {
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (pos === null) return;
            // lineAt returns 1-based line numbers; sourceMap uses 0-based.
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

  // Update editor content whenever generated output changes.
  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === lastContent) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: lastContent }
    });
  }, [lastContent]);

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
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <TargetSwitcher value={target} onChange={handleTargetChange} />
        <span
          className="text-xs text-muted-foreground ml-auto"
          data-testid="codegen-status"
          aria-live="polite"
        >
          {statusLabel(status, target)}
        </span>
      </div>
      <div
        ref={editorContainerRef}
        data-testid="code-preview-editor"
        className="flex-1 overflow-auto"
      />
    </section>
  );
}
