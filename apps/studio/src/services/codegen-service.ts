// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Code generation service integration for Studio.
 *
 * Two deployment modes:
 *  - **Local**: baseUrl points at `http://localhost:8377`; Studio talks to the
 *    existing codegen server started by `pnpm codegen:start`. Endpoints used:
 *    /api/health, /api/languages, /api/generate.
 *  - **Hosted** (feature 011-export-code-cf): baseUrl is relative (`/rune-studio`)
 *    or a non-localhost absolute URL. Studio talks to the CF Worker which
 *    exposes the new `/api/generate/health` + `/api/generate` contract,
 *    gated by CF Turnstile + Durable Object rate-limiting.
 *
 * @see specs/008-core-editor-features/contracts/codegen-api.md (local)
 * @see specs/011-export-code-cf/contracts/http-generate.md (hosted)
 */

import { KNOWN_GENERATORS } from '@rune-langium/codegen-legacy';
import type { FormPreviewSchema } from '@rune-langium/codegen';
import type {
  CodeGenerationRequest,
  CodeGenerationResult,
  GeneratedFile,
  GenerationError
} from '@rune-langium/codegen-legacy';

export type { CodeGenerationRequest, CodeGenerationResult, GeneratedFile };
export { KNOWN_GENERATORS };

export interface PreviewFileEntry {
  uri: string;
  content: string;
}

export interface PreviewSetFilesMessage {
  type: 'preview:setFiles';
  files: PreviewFileEntry[];
  requestId?: string;
}

export interface PreviewGenerateMessage {
  type: 'preview:generate';
  targetId: string;
  requestId: string;
}

export interface PreviewResultMessage {
  type: 'preview:result';
  targetId: string;
  requestId: string;
  schema: FormPreviewSchema;
}

export interface PreviewStaleMessage {
  type: 'preview:stale';
  targetId?: string;
  requestId: string;
  reason: 'parse-error' | 'generation-error' | 'unsupported-target' | 'no-files';
  message: string;
}

export interface PreviewExecuteMessage {
  type: 'preview:execute';
  funcName: string;
  inputs: Record<string, unknown>;
  requestId: string;
}

export function createPreviewExecuteMessage(
  funcName: string,
  inputs: Record<string, unknown>,
  requestId: string
): PreviewExecuteMessage {
  return { type: 'preview:execute', funcName, inputs, requestId };
}

export function isPreviewExecuteResultMessage(msg: unknown): msg is {
  type: 'preview:execute-result';
  requestId: string;
  funcName: string;
  output: unknown;
} {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as Record<string, unknown>).type === 'preview:execute-result'
  );
}

export function isPreviewExecuteErrorMessage(msg: unknown): msg is {
  type: 'preview:execute-error';
  requestId: string;
  funcName: string;
  error: string;
} {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as Record<string, unknown>).type === 'preview:execute-error'
  );
}

export type PreviewWorkerRequest = PreviewSetFilesMessage | PreviewGenerateMessage;
export type PreviewWorkerMessage = PreviewResultMessage | PreviewStaleMessage;

const PREVIEW_STALE_REASONS = new Set<PreviewStaleMessage['reason']>([
  'parse-error',
  'generation-error',
  'unsupported-target',
  'no-files'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export function createPreviewSetFilesMessage(
  files: PreviewFileEntry[],
  requestId?: string
): PreviewSetFilesMessage {
  return { type: 'preview:setFiles', files, ...(requestId ? { requestId } : {}) };
}

export function createPreviewGenerateMessage(
  targetId: string,
  requestId: string
): PreviewGenerateMessage {
  return { type: 'preview:generate', targetId, requestId };
}

export function isPreviewWorkerMessage(message: unknown): message is PreviewWorkerMessage {
  if (!message || typeof message !== 'object') return false;
  const candidate = message as Record<string, unknown>;
  const type = candidate.type;
  if (type === 'preview:result') {
    return (
      typeof candidate.targetId === 'string' &&
      typeof candidate.requestId === 'string' &&
      isFormPreviewSchema(candidate.schema)
    );
  }
  if (type === 'preview:stale') {
    return (
      (candidate.targetId === undefined || typeof candidate.targetId === 'string') &&
      typeof candidate.requestId === 'string' &&
      typeof candidate.reason === 'string' &&
      PREVIEW_STALE_REASONS.has(candidate.reason as PreviewStaleMessage['reason']) &&
      typeof candidate.message === 'string'
    );
  }
  return false;
}

function isFormPreviewSchema(value: unknown): value is FormPreviewSchema {
  if (!isRecord(value)) return false;
  const candidate = value;
  if (
    candidate.schemaVersion !== 1 ||
    typeof candidate.targetId !== 'string' ||
    typeof candidate.title !== 'string' ||
    (candidate.status !== 'ready' && candidate.status !== 'unsupported') ||
    !Array.isArray(candidate.fields) ||
    !candidate.fields.every(isPreviewField)
  ) {
    return false;
  }
  if (
    candidate.unsupportedFeatures !== undefined &&
    (!Array.isArray(candidate.unsupportedFeatures) ||
      !candidate.unsupportedFeatures.every((item) => typeof item === 'string'))
  ) {
    return false;
  }
  if (
    candidate.sourceMap !== undefined &&
    (!Array.isArray(candidate.sourceMap) || !candidate.sourceMap.every(isPreviewSourceMapEntry))
  ) {
    return false;
  }
  return true;
}

function isPreviewField(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const candidate = value;
  if (
    typeof candidate.path !== 'string' ||
    typeof candidate.label !== 'string' ||
    typeof candidate.required !== 'boolean' ||
    !isPreviewFieldKind(candidate.kind)
  ) {
    return false;
  }
  if (
    candidate.cardinality !== undefined &&
    !isPreviewCardinality(candidate.cardinality as Record<string, unknown>)
  ) {
    return false;
  }
  if (candidate.description !== undefined && typeof candidate.description !== 'string') {
    return false;
  }
  switch (candidate.kind) {
    case 'enum':
      return Array.isArray(candidate.enumValues) && candidate.enumValues.every(isEnumValue);
    case 'object':
      return Array.isArray(candidate.children) && candidate.children.every(isPreviewField);
    case 'array':
      return (
        Array.isArray(candidate.children) &&
        candidate.children.length === 1 &&
        candidate.children.every(isPreviewField)
      );
    default:
      return candidate.enumValues === undefined && candidate.children === undefined;
  }
}

function isPreviewFieldKind(value: unknown): boolean {
  return (
    value === 'string' ||
    value === 'number' ||
    value === 'boolean' ||
    value === 'enum' ||
    value === 'object' ||
    value === 'array' ||
    value === 'unknown'
  );
}

function isPreviewCardinality(value: Record<string, unknown>): boolean {
  return (
    (value.min === undefined || typeof value.min === 'number') &&
    (value.max === undefined || typeof value.max === 'number' || value.max === 'unbounded')
  );
}

function isEnumValue(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const candidate = value;
  return typeof candidate.value === 'string' && typeof candidate.label === 'string';
}

function isPreviewSourceMapEntry(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const candidate = value;
  return (
    typeof candidate.fieldPath === 'string' &&
    typeof candidate.sourceUri === 'string' &&
    typeof candidate.sourceLine === 'number' &&
    typeof candidate.sourceChar === 'number'
  );
}

function isGeneratedFile(value: unknown): value is GeneratedFile {
  return isRecord(value) && typeof value.path === 'string' && typeof value.content === 'string';
}

function isGenerationError(value: unknown): value is GenerationError {
  return (
    isRecord(value) &&
    typeof value.sourceFile === 'string' &&
    typeof value.construct === 'string' &&
    typeof value.message === 'string'
  );
}

function parseCodeGenerationResultBody(
  value: unknown
): Omit<CodeGenerationResult, 'language'> | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.files) ||
    !value.files.every(isGeneratedFile) ||
    !Array.isArray(value.errors) ||
    !value.errors.every(isGenerationError) ||
    (value.warnings !== undefined &&
      (!Array.isArray(value.warnings) ||
        !value.warnings.every((warning) => typeof warning === 'string')))
  ) {
    return null;
  }
  return {
    files: value.files,
    errors: value.errors,
    warnings: Array.isArray(value.warnings) ? value.warnings : []
  };
}

function isHostedLanguagesEnvelope(value: unknown): value is { languages?: string[] } {
  return (
    isRecord(value) &&
    (value.languages === undefined ||
      (Array.isArray(value.languages) && value.languages.every((item) => typeof item === 'string')))
  );
}

function isLocalLanguagesEnvelope(
  value: unknown
): value is { languages: Array<{ id: string; class: string }> } {
  return (
    isRecord(value) &&
    Array.isArray(value.languages) &&
    value.languages.every(
      (item) => isRecord(item) && typeof item.id === 'string' && typeof item.class === 'string'
    )
  );
}

/** Default codegen service URL. Override via VITE_CODEGEN_URL env var. */
const DEFAULT_CODEGEN_URL = 'http://localhost:8377';

export interface GenerateOptions {
  /**
   * Turnstile token from the widget. Required for the first generation per
   * hosted session; subsequent generations omit this and rely on the
   * hcsession cookie. Ignored in local mode.
   */
  turnstileToken?: string;
}

/**
 * Browser-compatible proxy that calls the codegen HTTP API.
 * For CLI usage, use CodegenServiceProxy from '@rune-langium/codegen-legacy/node'.
 */
export class BrowserCodegenProxy {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    const envUrl =
      typeof import.meta !== 'undefined'
        ? (import.meta as unknown as Record<string, Record<string, string>>).env?.[
            'VITE_CODEGEN_URL'
          ]
        : undefined;
    this.baseUrl = baseUrl ?? envUrl ?? DEFAULT_CODEGEN_URL;
  }

  /**
   * True when this proxy targets the hosted Worker (relative URL or
   * non-localhost absolute URL). Callers use this to decide whether to
   * render the Turnstile widget and which endpoints to hit.
   */
  isHostedService(): boolean {
    const base = this.baseUrl;
    if (base.startsWith('/')) return true;
    try {
      const { hostname } = new URL(base);
      return hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '0.0.0.0';
    } catch {
      // Non-absolute, non-root-relative URL — treat as hosted (safer default).
      return true;
    }
  }

  async generate(
    request: CodeGenerationRequest,
    signal?: AbortSignal,
    options?: GenerateOptions
  ): Promise<CodeGenerationResult> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options?.turnstileToken) {
      headers['X-Turnstile-Token'] = options.turnstileToken;
    }

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal,
      // Hosted only: the hcsession cookie the Worker sets on first generation
      // must ride along on subsequent requests. In local mode we use `omit`
      // because the local codegen server sends Access-Control-Allow-Origin:*
      // and browsers reject credentialed CORS against a wildcard origin.
      credentials: this.isHostedService() ? 'include' : 'omit'
    });

    if (!response.ok) {
      if (response.status === 422) {
        const body = await response.json();
        return {
          language: request.language,
          files: [],
          errors:
            isRecord(body) && Array.isArray(body.errors) && body.errors.every(isGenerationError)
              ? body.errors
              : [
                  {
                    sourceFile: '',
                    construct: '',
                    message: 'Validation errors in input model'
                  }
                ],
          warnings: []
        };
      }
      // Let callers distinguish by status via the thrown message; dialog-side
      // UX maps 401/429/5xx to specific messages (see ExportDialog T028).
      const err = new Error(`Code generation failed (HTTP ${response.status})`);
      (err as Error & { status?: number }).status = response.status;
      try {
        (err as Error & { body?: unknown }).body = await response.json();
      } catch {
        /* non-JSON body; ignore */
      }
      throw err;
    }

    const result = parseCodeGenerationResultBody(await response.json());
    if (!result) {
      throw new Error('Code generation returned an invalid response payload');
    }
    return { language: request.language, ...result };
  }

  async listLanguages(): Promise<Array<{ id: string; class: string }>> {
    if (this.isHostedService()) {
      // New contract returns languages inside the health envelope.
      const response = await fetch(`${this.baseUrl}/api/generate/health`);
      if (!response.ok) {
        throw new Error(`Language discovery failed (HTTP ${response.status})`);
      }
      const data = await response.json();
      if (!isHostedLanguagesEnvelope(data)) {
        throw new Error('Language discovery returned an invalid hosted response payload');
      }
      return (data.languages ?? []).map((id) => ({ id, class: '' }));
    }
    const response = await fetch(`${this.baseUrl}/api/languages`);
    if (!response.ok) {
      throw new Error(`Language discovery failed (HTTP ${response.status})`);
    }
    const data = await response.json();
    if (!isLocalLanguagesEnvelope(data)) {
      throw new Error('Language discovery returned an invalid local response payload');
    }
    return data.languages;
  }

  async isAvailable(): Promise<boolean> {
    const path = this.isHostedService() ? '/api/generate/health' : '/api/health';
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        signal: AbortSignal.timeout(3000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

let _instance: BrowserCodegenProxy | undefined;

export function getCodegenService(): BrowserCodegenProxy {
  if (!_instance) {
    _instance = new BrowserCodegenProxy();
  }
  return _instance;
}
