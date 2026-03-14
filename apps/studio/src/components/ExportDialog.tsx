/**
 * ExportDialog — Code generation export dialog.
 * Allows users to select a target language, generate code via the codegen service proxy,
 * preview generated files, and download as individual files.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@rune-langium/design-system/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@rune-langium/design-system/ui/select';
import { ScrollArea } from '@rune-langium/design-system/ui/scroll-area';
import { Separator } from '@rune-langium/design-system/ui/separator';
import { Spinner } from '@rune-langium/design-system/ui/spinner';
import { KNOWN_GENERATORS } from '@rune-langium/codegen';
import type { CodeGenerationResult, GeneratedFile, GenerationError } from '@rune-langium/codegen';
import { getCodegenService } from '../services/codegen-service.js';
import { downloadFile } from '../services/export.js';

export interface ExportDialogProps {
  /** Callback to get user-authored .rosetta files (path → content). */
  getUserFiles: () => Map<string, string>;
  /** Callback to get reference model .rosetta files (path → content). */
  getReferenceFiles?: () => Map<string, string>;
  /** Whether the dialog is open. */
  open: boolean;
  /** Callback to close the dialog. */
  onClose: () => void;
  /** Optional: pre-export validation. Returns error messages or empty array if valid. */
  validateModel?: () => string[];
}

type DialogState =
  | { phase: 'idle' }
  | { phase: 'validating' }
  | { phase: 'generating'; language: string }
  | { phase: 'done'; result: CodeGenerationResult }
  | { phase: 'error'; message: string };

export function ExportDialog({
  getUserFiles,
  getReferenceFiles,
  open,
  onClose,
  validateModel
}: ExportDialogProps) {
  const [language, setLanguage] = useState('java');
  const [state, setState] = useState<DialogState>({ phase: 'idle' });
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null);
  const [serviceAvailable, setServiceAvailable] = useState<boolean | null>(null);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Check service availability when dialog opens
  useEffect(() => {
    if (!open) return;
    setState({ phase: 'idle' });
    setSelectedFile(null);
    setValidationWarnings([]);

    const service = getCodegenService();
    service.isAvailable().then(setServiceAvailable);
  }, [open]);

  const handleGenerate = useCallback(async () => {
    // Pre-export validation (T041)
    if (validateModel) {
      setState({ phase: 'validating' });
      const warnings = validateModel();
      if (warnings.length > 0) {
        setValidationWarnings(warnings);
      }
    }

    setState({ phase: 'generating', language });

    const userFiles = getUserFiles();
    if (userFiles.size === 0) {
      setState({ phase: 'error', message: 'No user-authored files to export.' });
      return;
    }

    const files = Array.from(userFiles.entries()).map(([path, content]) => ({
      path,
      content
    }));

    // Add reference files as compilation context
    if (getReferenceFiles) {
      const refFiles = getReferenceFiles();
      for (const [path, content] of refFiles) {
        files.push({ path, content });
      }
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const service = getCodegenService();
      const result = await service.generate({ language, files }, controller.signal);
      setState({ phase: 'done', result });
      if (result.files.length > 0) {
        setSelectedFile(result.files[0]!);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setState({ phase: 'idle' });
      } else {
        setState({ phase: 'error', message: (err as Error).message });
      }
    } finally {
      abortRef.current = null;
    }
  }, [language, getUserFiles, getReferenceFiles, validateModel]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setState({ phase: 'idle' });
  }, []);

  const handleDownloadFile = useCallback((file: GeneratedFile) => {
    const filename = file.path.split('/').pop() ?? file.path;
    downloadFile(file.content, filename);
  }, []);

  const handleDownloadAll = useCallback(() => {
    if (state.phase !== 'done') return;
    for (const file of state.result.files) {
      const filename = file.path.split('/').pop() ?? file.path;
      downloadFile(file.content, filename);
    }
  }, [state]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="export-dialog-overlay"
    >
      <div
        className="bg-card border border-border rounded-lg shadow-lg w-[720px] max-h-[80vh] flex flex-col"
        data-testid="export-dialog"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-lg font-semibold">Export Code</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <Separator />

        {/* Content */}
        <div className="flex-1 min-h-0 p-4 flex flex-col gap-4">
          {/* Service unavailable warning */}
          {serviceAvailable === false && (
            <div className="px-3 py-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
              Code generation service is not available. Ensure the service is running and configured
              via VITE_CODEGEN_URL.
            </div>
          )}

          {/* Validation warnings */}
          {validationWarnings.length > 0 && (
            <div className="px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-sm">
              <p className="font-medium mb-1">Validation warnings:</p>
              <ul className="list-disc pl-4">
                {validationWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Language selector + generate button */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">Target language:</label>
            <Select
              value={language}
              onValueChange={setLanguage}
              disabled={state.phase === 'generating'}
            >
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KNOWN_GENERATORS.map((gen) => (
                  <SelectItem key={gen.id} value={gen.id}>
                    {gen.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {state.phase === 'generating' ? (
              <Button variant="secondary" size="sm" onClick={handleCancel}>
                Cancel
              </Button>
            ) : (
              <Button size="sm" onClick={handleGenerate} disabled={serviceAvailable === false}>
                Generate
              </Button>
            )}
          </div>

          {/* Generating state */}
          {state.phase === 'generating' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              Generating {state.language} code...
            </div>
          )}

          {/* Error state */}
          {state.phase === 'error' && (
            <div className="px-3 py-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
              {state.message}
            </div>
          )}

          {/* Results */}
          {state.phase === 'done' && (
            <>
              {state.result.errors.length > 0 && (
                <div className="px-3 py-2 bg-destructive/10 border border-destructive/20 rounded text-sm">
                  <p className="font-medium text-destructive mb-1">
                    {state.result.errors.length} error(s):
                  </p>
                  <ul className="list-disc pl-4 text-destructive">
                    {state.result.errors.map((err: GenerationError, i: number) => (
                      <li key={i}>
                        {err.sourceFile && <span className="font-mono">{err.sourceFile}: </span>}
                        {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {state.result.files.length > 0 && (
                <div className="flex flex-1 min-h-0 gap-3">
                  {/* File list */}
                  <div className="w-48 flex-shrink-0 flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {state.result.files.length} file(s)
                      </span>
                      <Button variant="ghost" size="sm" onClick={handleDownloadAll}>
                        Download all
                      </Button>
                    </div>
                    <ScrollArea className="flex-1 border border-border rounded">
                      <div className="p-1">
                        {state.result.files.map((file: GeneratedFile) => {
                          const shortName = file.path.split('/').pop() ?? file.path;
                          return (
                            <button
                              key={file.path}
                              className={`w-full text-left px-2 py-1 text-xs font-mono rounded truncate ${
                                selectedFile?.path === file.path
                                  ? 'bg-accent text-accent-foreground'
                                  : 'hover:bg-muted'
                              }`}
                              onClick={() => setSelectedFile(file)}
                              title={file.path}
                            >
                              {shortName}
                            </button>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </div>

                  {/* Code preview */}
                  <div className="flex-1 min-w-0 flex flex-col">
                    {selectedFile && (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-mono text-muted-foreground truncate">
                            {selectedFile.path}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownloadFile(selectedFile)}
                          >
                            Download
                          </Button>
                        </div>
                        <ScrollArea className="flex-1 border border-border rounded bg-muted/30">
                          <pre className="p-3 text-xs font-mono whitespace-pre overflow-x-auto">
                            {selectedFile.content}
                          </pre>
                        </ScrollArea>
                      </>
                    )}
                  </div>
                </div>
              )}

              {state.result.files.length === 0 && state.result.errors.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No files generated. The model may not contain exportable constructs.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
