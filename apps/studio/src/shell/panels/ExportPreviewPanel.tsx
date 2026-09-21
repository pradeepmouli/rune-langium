// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useEffect, useState, type ReactElement } from 'react';
import { Button } from '@rune-langium/design-system/ui/button';
import type { ExportRunState } from '../../store/export-workbench-store.js';
import { withInstrumentation } from '../../services/instrumentation/core.js';

export interface ExportPreviewPanelProps {
  run: ExportRunState;
  onDownload(): void;
}

/** Read-only display of the current captured export artifact. */
export const ExportPreviewPanel = withInstrumentation(
  function ExportPreviewPanel({ run, onDownload }: ExportPreviewPanelProps): ReactElement {
    const [text, setText] = useState<string | undefined>();
    const artifact = run.status === 'ready' || run.status === 'stale' ? run.artifact : undefined;
    const textFile = artifact?.manifest.files.find((file) => file.kind === 'text');

    useEffect(() => {
      let active = true;
      setText(undefined);
      if (!artifact || !textFile) return;
      void artifact.readText(textFile.path).then((content) => {
        if (active) setText(content);
      });
      return () => {
        active = false;
      };
    }, [artifact, textFile?.path]);

    if (run.status === 'generating') {
      return (
        <p data-testid="export-artifact-status" className="p-4 text-sm text-muted-foreground">
          Generating export…
        </p>
      );
    }
    if (run.status === 'failed') {
      return (
        <p data-testid="export-artifact-status" className="p-4 text-sm text-destructive">
          {run.message}
        </p>
      );
    }
    if (!artifact) {
      return (
        <p data-testid="export-artifact-status" className="p-4 text-sm text-muted-foreground">
          No export artifact yet.
        </p>
      );
    }
    if (!textFile) {
      return (
        <div data-testid="export-artifact-binary" className="flex items-center justify-between gap-3 p-4">
          <p className="text-sm text-muted-foreground">This export contains binary files only.</p>
          <Button type="button" size="sm" disabled={run.status === 'stale'} onClick={onDownload}>
            Download export
          </Button>
        </div>
      );
    }
    return (
      <section data-testid="export-artifact-preview" className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-1.5">
          <span className="truncate text-sm font-medium">{textFile.path}</span>
          <span className="ml-auto text-xs text-muted-foreground">{run.status === 'stale' ? 'Outdated' : 'Ready'}</span>
          <Button type="button" size="sm" disabled={run.status === 'stale'} onClick={onDownload}>
            Download export
          </Button>
        </div>
        <pre
          className="studio-scroll min-h-0 flex-1 overflow-auto p-3 text-xs whitespace-pre"
          aria-label="Generated export code"
        >
          {text ?? 'Loading artifact…'}
        </pre>
      </section>
    );
  },
  { op: 'ExportPreviewPanel' }
);
