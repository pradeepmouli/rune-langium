// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import React, { useEffect, useRef, useCallback, useState } from 'react';
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
      return 'Generating…';
    case 'generated':
      return `Generated (${TARGET_LABELS[target]})`;
    case 'outdated':
      return 'Outdated — fix errors to refresh';
    case 'unavailable':
      return 'Preview unavailable — reload Studio';
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

  // Click-to-navigate: map output line index → source location via sourceMap
  const handleLineClick = useCallback(
    (outputLine: number) => {
      if (!sourceEditorRef) return;
      const entry = sourceMapRef.current.find((e) => e.outputLine === outputLine);
      if (!entry) return;
      sourceEditorRef.revealLineInCenter(entry.sourceLine);
      sourceEditorRef.setSelection({ line: entry.sourceLine, character: entry.sourceChar });
    },
    [sourceEditorRef]
  );

  return (
    <section
      id={CODE_PREVIEW_PANEL_ID}
      role="tabpanel"
      aria-label="Code preview"
      aria-labelledby={`codegen-tab-${target}`}
      data-testid="panel-codePreview"
      data-component="workspace.codePreview"
    >
      <TargetSwitcher value={target} onChange={handleTargetChange} />
      <div data-testid="codegen-status" aria-live="polite">
        {statusLabel(status, target)}
      </div>
      <div data-testid="code-preview-editor">
        {lastContent && (
          <pre>
            {lastContent.split('\n').map((line, idx) => (
              <div key={idx} data-line={idx} onClick={() => handleLineClick(idx)}>
                {line}
              </div>
            ))}
          </pre>
        )}
      </div>
    </section>
  );
}
