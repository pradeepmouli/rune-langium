// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * ExportDialog — Code generation export dialog.
 * Allows users to select a target language, generate code via the codegen service proxy,
 * preview generated files, and download as individual files.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
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

interface ErrorDetails {
  message: string;
  /** HTTP status from the Worker, when available (401 / 429 / 502 / 5xx). */
  status?: number;
  /** Parsed error body from the Worker, when JSON-decodable. */
  body?: {
    error?: string;
    scope?: 'hour' | 'day';
    retry_after_s?: number;
    remaining_hour?: number;
    remaining_day?: number;
    message?: string;
    [k: string]: unknown;
  };
}

type DialogState =
  | { phase: 'idle' }
  | { phase: 'validating' }
  | { phase: 'generating'; language: string }
  | { phase: 'done'; result: CodeGenerationResult }
  | { phase: 'error'; details: ErrorDetails };

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

  // Hosted-mode Turnstile integration (feature 011-export-code-cf).
  // The widget only renders when the configured codegen URL is a hosted
  // Worker (relative URL or non-localhost) AND a site key is provided.
  // After one successful generation, the Worker issues a session cookie
  // and subsequent generations in this session skip Turnstile — we
  // signal that by clearing `turnstileToken` only when the widget's
  // onSuccess fires.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const service = useMemo(() => getCodegenService(), []);
  const isHosted = service.isHostedService();
  const turnstileSiteKey = (
    typeof import.meta !== 'undefined'
      ? (import.meta as unknown as Record<string, Record<string, string>>).env?.[
          'VITE_TURNSTILE_SITE_KEY'
        ]
      : undefined
  ) as string | undefined;
  const showTurnstile = isHosted && Boolean(turnstileSiteKey);
  // Track whether the session cookie is probably set (true after a
  // successful first generation) so we can hide the widget on re-opens.
  const sessionCookieAcquiredRef = useRef(false);
  const turnstileNeeded = showTurnstile && !sessionCookieAcquiredRef.current;

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
      setState({
        phase: 'error',
        details: { message: 'No user-authored files to export.' }
      });
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
      const options = turnstileToken !== null ? { turnstileToken } : undefined;
      const result = await service.generate({ language, files }, controller.signal, options);
      setState({ phase: 'done', result });
      if (result.files.length > 0) {
        setSelectedFile(result.files[0]!);
      }
      // First generation on a hosted deploy: consume the Turnstile token
      // and flag the session as cookie-bearing for subsequent generations.
      if (turnstileToken !== null) {
        setTurnstileToken(null);
        sessionCookieAcquiredRef.current = true;
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setState({ phase: 'idle' });
      } else {
        // If the Worker rejected with 401 turnstile_required, invalidate
        // our cached session flag so the widget re-renders next time.
        const status = (err as Error & { status?: number }).status;
        const body = (err as Error & { body?: ErrorDetails['body'] }).body;
        if (status === 401) {
          sessionCookieAcquiredRef.current = false;
          setTurnstileToken(null);
        }
        setState({
          phase: 'error',
          details: { message: (err as Error).message, status, body }
        });
      }
    } finally {
      abortRef.current = null;
    }
  }, [language, getUserFiles, getReferenceFiles, validateModel, service, turnstileToken]);

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

  function renderErrorBody(details: ErrorDetails) {
    const { status, body, message } = details;
    // 401 turnstile_required → re-challenge is automatic; short message.
    if (status === 401 && body?.error === 'turnstile_required') {
      return <>Please complete the verification challenge above and try again.</>;
    }
    // 429 rate_limited → show retry window + local-dev hint.
    if (status === 429 && body?.error === 'rate_limited') {
      const mins =
        typeof body.retry_after_s === 'number' ? Math.ceil(body.retry_after_s / 60) : null;
      return (
        <>
          <p className="font-medium mb-1">Rate limit reached</p>
          <p>
            {body.message ??
              (body.scope === 'hour'
                ? `You've hit the free-tier limit (10/hour).`
                : `You've hit the daily limit (100/day).`)}
          </p>
          {mins !== null && <p className="mt-1">Try again in {mins} minutes.</p>}
          <p className="mt-1">
            Need more? Run Studio locally with <code className="font-mono">pnpm codegen:start</code>{' '}
            for unlimited generation.
          </p>
        </>
      );
    }
    // 502 / 5xx upstream_failure → the container is warming or transiently sick.
    if (status !== undefined && status >= 502) {
      return (
        <>
          <p className="font-medium mb-1">Code generation service is warming up</p>
          <p>The service is temporarily unavailable. Please retry in a minute.</p>
        </>
      );
    }
    // Fallback: whatever message came from the thrown error.
    return <>{message}</>;
  }

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
          {/* Service unavailable warning — T030: give hosted users a
              different hint than local-dev users. */}
          {serviceAvailable === false && (
            <div className="px-3 py-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
              {isHosted ? (
                <>
                  The code generation service is temporarily unavailable. Please try again in a
                  minute, or{' '}
                  <a
                    href="https://github.com/pradeepmouli/rune-langium#export-code"
                    className="underline"
                  >
                    run Studio locally
                  </a>{' '}
                  for unlimited generation.
                </>
              ) : (
                <>
                  Code generation service is not available. Start it with{' '}
                  <code className="font-mono">pnpm codegen:start</code>, or set{' '}
                  <code className="font-mono">VITE_CODEGEN_URL</code> to a reachable service.
                </>
              )}
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

          {/* CF Turnstile challenge — hosted deploys only; first generation per session */}
          {turnstileNeeded && turnstileSiteKey && (
            <div
              className="flex items-center justify-center py-2"
              data-testid="turnstile-widget-container"
            >
              <Turnstile
                siteKey={turnstileSiteKey}
                onSuccess={(token) => setTurnstileToken(token)}
                onExpire={() => setTurnstileToken(null)}
                onError={() => setTurnstileToken(null)}
                options={{ action: 'export-code', theme: 'auto', size: 'flexible' }}
              />
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
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={
                  serviceAvailable === false || (turnstileNeeded && turnstileToken === null)
                }
              >
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

          {/* Error state — degraded UX (T028) with specific messages for
              the known Worker error shapes. */}
          {state.phase === 'error' && (
            <div
              className="px-3 py-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive"
              data-testid="export-error"
              data-error-status={state.details.status ?? ''}
            >
              {renderErrorBody(state.details)}
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
