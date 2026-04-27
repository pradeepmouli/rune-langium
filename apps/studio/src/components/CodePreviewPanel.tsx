// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import React, { useEffect, useRef, useCallback, useState } from 'react';
import type { Target, SourceMapEntry } from '@rune-langium/codegen';
import { TargetSwitcher } from './TargetSwitcher.js';
import { useCodegenStore } from '../store/codegen-store.js';

export interface SourceEditorHandle {
  revealLineInCenter(line: number): void;
  setSelection(range: unknown): void;
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

const TARGET_LABELS: Record<Target, string> = {
  zod: 'Zod',
  'json-schema': 'JSON Schema',
  typescript: 'TypeScript'
};

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
  // target is the single source of truth from the shared codegen store
  const target = useCodegenStore((s) => s.codePreviewTarget);
  const setCodePreviewTarget = useCodegenStore((s) => s.setCodePreviewTarget);

  const [status, setStatus] = useState<Status>('generating');
  // Retain the last successfully generated content so the panel doesn't blank on outdated
  const [lastContent, setLastContent] = useState<string>('');
  const sourceMapRef = useRef<SourceMapEntry[]>([]);
  const editorHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMessage(e: MessageEvent<CodegenWorkerMessage>) {
      const msg = e.data;
      if (msg.type === 'codegen:result') {
        setStatus('generated');
        setLastContent(msg.content);
        sourceMapRef.current = msg.sourceMap;
        setCodePreviewTarget(msg.target);
      } else if (msg.type === 'codegen:outdated') {
        // Keep lastContent — show previous output with an outdated badge
        setStatus('outdated');
      }
    }
    worker.addEventListener('message', handleMessage as EventListener);
    return () => worker.removeEventListener('message', handleMessage as EventListener);
  }, [worker, setCodePreviewTarget]);

  const handleTargetChange = useCallback(
    (newTarget: Target) => {
      setCodePreviewTarget(newTarget);
      worker.postMessage({ type: 'codegen:generate', target: newTarget });
    },
    [worker, setCodePreviewTarget]
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
      role="region"
      aria-label="Code preview"
      data-testid="panel-codePreview"
      data-component="workspace.codePreview"
    >
      <TargetSwitcher value={target} onChange={handleTargetChange} />
      <div data-testid="codegen-status" aria-live="polite">
        {statusLabel(status, target)}
      </div>
      <div ref={editorHostRef} data-testid="code-preview-editor">
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
