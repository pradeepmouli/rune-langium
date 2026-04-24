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

import { KNOWN_GENERATORS } from '@rune-langium/codegen';
import type {
  CodeGenerationRequest,
  CodeGenerationResult,
  GeneratedFile,
  GenerationError
} from '@rune-langium/codegen';

export type { CodeGenerationRequest, CodeGenerationResult, GeneratedFile };
export { KNOWN_GENERATORS };

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
 * For CLI usage, use CodegenServiceProxy from '@rune-langium/codegen/node'.
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
        const body = (await response.json()) as { errors?: GenerationError[] };
        return {
          language: request.language,
          files: [],
          errors: body.errors ?? [
            { sourceFile: '', construct: '', message: 'Validation errors in input model' }
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

    const result = (await response.json()) as Omit<CodeGenerationResult, 'language'>;
    return { language: request.language, ...result };
  }

  async listLanguages(): Promise<Array<{ id: string; class: string }>> {
    if (this.isHostedService()) {
      // New contract returns languages inside the health envelope.
      const response = await fetch(`${this.baseUrl}/api/generate/health`);
      const data = (await response.json()) as { languages?: string[] };
      return (data.languages ?? []).map((id) => ({ id, class: '' }));
    }
    const response = await fetch(`${this.baseUrl}/api/languages`);
    const data = (await response.json()) as { languages: Array<{ id: string; class: string }> };
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
