// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import React, { useEffect, useRef, useCallback, useState } from 'react';
import type { Target, SourceMapEntry } from '@rune-langium/codegen';
import { TargetSwitcher } from './TargetSwitcher.js';

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
  const [target, setTarget] = useState<Target>('zod');
  const [status, setStatus] = useState<Status>('generating');
  const sourceMapRef = useRef<SourceMapEntry[]>([]);
  const editorHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMessage(e: MessageEvent<CodegenWorkerMessage>) {
      const msg = e.data;
      if (msg.type === 'codegen:result') {
        setStatus('generated');
        sourceMapRef.current = msg.sourceMap;
        setTarget(msg.target);
      } else if (msg.type === 'codegen:outdated') {
        setStatus('outdated');
      }
    }
    worker.addEventListener('message', handleMessage as EventListener);
    return () => worker.removeEventListener('message', handleMessage as EventListener);
  }, [worker]);

  const handleTargetChange = useCallback(
    (newTarget: Target) => {
      setTarget(newTarget);
      worker.postMessage({ type: 'codegen:generate', target: newTarget });
    },
    [worker]
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
      {/* TODO: install CodeMirror EditorView click-to-navigate handler here once
          the full doc-builder integration provides sourceMap entries (FR-018). */}
      <div ref={editorHostRef} data-testid="code-preview-editor" />
    </section>
  );
}
