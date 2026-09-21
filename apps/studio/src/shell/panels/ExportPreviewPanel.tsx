// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useEffect, useState, type ReactElement } from 'react';
import { Button } from '@rune-langium/design-system/ui/button';
import type { ExportRunState } from '../../store/export-workbench-store.js';
import { withInstrumentation } from '../../services/instrumentation/core.js';

export interface ExportPreviewPanelProps {
  run: ExportRunState;
  activeFile?: string;
  onActiveFileChange?(path: string | undefined): void;
  onDownload(): void;
}

/** Read-only display of the current captured export artifact. */
export const ExportPreviewPanel = withInstrumentation(
  function ExportPreviewPanel({
    run,
    activeFile,
    onActiveFileChange,
    onDownload
  }: ExportPreviewPanelProps): ReactElement {
    const [text, setText] = useState<string | undefined>();
    const [uncontrolledPath, setUncontrolledPath] = useState<string | undefined>();
    const selectedPath = activeFile ?? uncontrolledPath;
    const artifact = run.status === 'ready' || run.status === 'stale' ? run.artifact : undefined;
    const textFiles = artifact?.manifest.files.filter((file) => file.kind === 'text') ?? [];
    const textFile = textFiles.find((file) => file.path === selectedPath) ?? textFiles[0];
    const dependencyCount = artifact?.manifest.resolvedSelection
      ? Math.max(
          0,
          artifact.manifest.resolvedSelection.included.length - artifact.manifest.resolvedSelection.explicit.length
        )
      : 0;

    useEffect(() => {
      if (!textFiles.some((file) => file.path === selectedPath)) {
        const nextPath = textFiles[0]?.path;
        setUncontrolledPath(nextPath);
        onActiveFileChange?.(nextPath);
      }
    }, [onActiveFileChange, selectedPath, textFiles]);

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
          {dependencyCount > 0 && (
            <span
              className="text-xs text-muted-foreground"
              title="Declarations added because selected roots reference them"
            >
              Includes {dependencyCount} dependency {dependencyCount === 1 ? 'declaration' : 'declarations'}
            </span>
          )}
          {textFiles.length > 1 && (
            <select
              aria-label="Generated export file"
              className="h-7 max-w-52 rounded border border-input bg-background px-2 text-xs"
              value={textFile.path}
              onChange={(event) => {
                setUncontrolledPath(event.target.value);
                onActiveFileChange?.(event.target.value);
              }}
            >
              {textFiles.map((file) => (
                <option key={file.path} value={file.path}>
                  {file.path}
                </option>
              ))}
            </select>
          )}
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
