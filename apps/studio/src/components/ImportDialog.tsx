// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * ImportDialog — brings an external schema (JSON Schema / OpenAPI / SQL DDL /
 * XSD) into the workspace as a new `.rune` file, or merges it into an
 * already-open file whose namespace matches (spec 021 Phase 4 consumer —
 * see docs/superpowers/specs/2026-07-06-explorer-import-dialog-design.md).
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@rune-langium/design-system/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rune-langium/design-system/ui/select';
import { Input } from '@rune-langium/design-system/ui/input';
import { Textarea } from '@rune-langium/design-system/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@rune-langium/design-system/ui/alert';
import { InteractiveDialog } from '@rune-langium/design-system/ui/interactive-dialog';
import { parse } from '@rune-langium/core';
import type { ImportResult, ImportSourceKind } from '@rune-langium/codegen/import';
import type { WorkspaceFile } from '../services/workspace.js';
import { createWorkspaceFile, updateFileContent } from '../services/workspace.js';
import { mergeImportedText, type MergeResult } from '../shell/import-merge.js';

export interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  files: readonly WorkspaceFile[];
  onFilesChange: (files: WorkspaceFile[]) => void;
  onFileFocused: (path: string) => void;
  /** namespace -> path, for every currently-open workspace file (ExplorePerspective's `namespaceToFile`). */
  namespaceToFile: ReadonlyMap<string, string>;
}

type ImportFormat = Extract<ImportSourceKind, 'json-schema' | 'openapi' | 'sql' | 'xsd'>;

const FORMAT_OPTIONS: Array<{ value: ImportFormat; label: string }> = [
  { value: 'json-schema', label: 'JSON Schema' },
  { value: 'openapi', label: 'OpenAPI' },
  { value: 'sql', label: 'SQL DDL' },
  { value: 'xsd', label: 'XSD' }
];

type Phase =
  | { kind: 'idle' }
  | { kind: 'previewing' }
  | { kind: 'previewed'; result: ImportResult; matchedPath: string | null; merge: MergeResult | null }
  | { kind: 'error'; message: string }
  | { kind: 'internal-error'; message: string };

export function ImportDialog({
  open,
  onClose,
  files,
  onFilesChange,
  onFileFocused,
  namespaceToFile
}: ImportDialogProps) {
  const [format, setFormat] = useState<ImportFormat>('json-schema');
  const [sourceText, setSourceText] = useState('');
  const [namespaceField, setNamespaceField] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  useEffect(() => {
    if (!open) return;
    setFormat('json-schema');
    setSourceText('');
    setNamespaceField('');
    setPhase({ kind: 'idle' });
  }, [open]);

  // Format switch invalidates any prior preview — it was run against a
  // different reader and no longer reflects the selected format.
  useEffect(() => {
    setPhase({ kind: 'idle' });
  }, [format]);

  const handlePreview = useCallback(async () => {
    setPhase({ kind: 'previewing' });
    try {
      const { importModel } = await import('@rune-langium/codegen/import');
      const result = await importModel(sourceText, {
        from: format,
        namespace: namespaceField.trim() || undefined
      });
      if (!namespaceField.trim()) setNamespaceField(result.model.namespace);

      const matchedPath = namespaceToFile.get(result.model.namespace) ?? null;
      if (matchedPath) {
        const existing = files.find((f) => f.path === matchedPath);
        if (existing) {
          try {
            const merge = await mergeImportedText(existing.content, result.text);
            setPhase({ kind: 'previewed', result, matchedPath, merge });
          } catch (mergeErr) {
            setPhase({
              kind: 'internal-error',
              message: mergeErr instanceof Error ? mergeErr.message : String(mergeErr)
            });
          }
          return;
        }
      }
      // New-file path: importModel() already guarantees result.text parses
      // cleanly, but we re-verify explicitly rather than trusting that blindly.
      const check = await parse(result.text);
      if (check.hasErrors) {
        setPhase({ kind: 'internal-error', message: 'Imported text failed re-parse — please file a bug.' });
        return;
      }
      setPhase({ kind: 'previewed', result, matchedPath: null, merge: null });
    } catch (err) {
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, [sourceText, format, namespaceField, namespaceToFile, files]);

  const handleConfirm = useCallback(() => {
    if (phase.kind !== 'previewed') return;
    const { result, matchedPath, merge } = phase;
    if (matchedPath && merge) {
      onFilesChange(updateFileContent(files, matchedPath, merge.mergedText));
      onFileFocused(matchedPath);
    } else {
      const file = createWorkspaceFile(`${result.model.namespace}.rosetta`, result.text);
      onFilesChange([...files, file]);
      onFileFocused(file.path);
    }
    onClose();
  }, [phase, files, onFilesChange, onFileFocused, onClose]);

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    void file.text().then(setSourceText);
  }, []);

  const nothingToImport =
    phase.kind === 'previewed' &&
    phase.result.model.types.length === 0 &&
    phase.result.model.enums.length === 0 &&
    phase.result.model.funcs.length === 0;

  const confirmDisabled = phase.kind !== 'previewed' || nothingToImport;
  const confirmLabel =
    phase.kind === 'previewed' && phase.matchedPath ? `Merge into ${phase.matchedPath}` : 'Add to workspace';

  return (
    <InteractiveDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Import Model"
      description="Pick a source format, provide the source, preview the generated model, and add it to the workspace."
      width="w-[640px]"
      testId="import-dialog"
      bodyClassName="p-4 gap-4 overflow-auto"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} data-testid="import-dialog__cancel">
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={confirmDisabled} data-testid="import-dialog__confirm">
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium" htmlFor="import-dialog-format">
          Format:
        </label>
        <Select
          value={format}
          onValueChange={(v) => setFormat(v as ImportFormat)}
          disabled={phase.kind === 'previewing'}
        >
          <SelectTrigger id="import-dialog-format" size="sm" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FORMAT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div
        className="border border-dashed border-border rounded p-3 text-xs text-muted-foreground"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleFileDrop}
        data-testid="import-dialog__dropzone"
      >
        Drop a file here, or paste the source below.
      </div>

      <Textarea
        value={sourceText}
        onChange={(e) => setSourceText(e.target.value)}
        placeholder="Paste source text…"
        className="min-h-32 font-mono text-xs"
        data-testid="import-dialog__source"
      />

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium" htmlFor="import-dialog-namespace">
          Namespace:
        </label>
        <Input
          id="import-dialog-namespace"
          value={namespaceField}
          onChange={(e) => setNamespaceField(e.target.value)}
          placeholder="(derived from source)"
          className="flex-1"
          data-testid="import-dialog__namespace"
        />
        <Button size="sm" onClick={() => void handlePreview()} disabled={!sourceText || phase.kind === 'previewing'}>
          Preview
        </Button>
      </div>

      {phase.kind === 'error' && (
        <Alert variant="destructive" data-testid="import-dialog__error">
          <AlertDescription>{phase.message}</AlertDescription>
        </Alert>
      )}

      {phase.kind === 'internal-error' && (
        <Alert variant="destructive" data-testid="import-dialog__internal-error">
          <AlertTitle>Internal error</AlertTitle>
          <AlertDescription>{phase.message}</AlertDescription>
        </Alert>
      )}

      {phase.kind === 'previewed' && (
        <>
          <p className="text-xs text-muted-foreground" data-testid="import-dialog__summary">
            {phase.result.model.types.length} type(s), {phase.result.model.enums.length} enum(s),{' '}
            {phase.result.model.funcs.length} func(s) · {phase.result.diagnostics.length} diagnostic(s)
          </p>
          {nothingToImport && (
            <Alert data-testid="import-dialog__empty">
              <AlertDescription>
                Nothing to import — the source produced no types, enums, or functions.
              </AlertDescription>
            </Alert>
          )}
          {phase.matchedPath && phase.merge && (
            <Alert data-testid="import-dialog__merge-banner">
              <AlertDescription>
                Will merge into <span className="font-mono">{phase.matchedPath}</span>
                {phase.merge.skipped.length > 0 &&
                  ` — ${phase.merge.skipped.length} declaration(s) skipped, already exist: ${phase.merge.skipped.join(', ')}`}
              </AlertDescription>
            </Alert>
          )}
          <pre
            className="studio-scroll flex-1 min-h-0 border border-border rounded bg-muted/30 p-3 text-xs font-mono whitespace-pre overflow-auto"
            data-testid="import-dialog__preview"
          >
            {phase.matchedPath && phase.merge ? phase.merge.mergedText : phase.result.text}
          </pre>
        </>
      )}
    </InteractiveDialog>
  );
}
