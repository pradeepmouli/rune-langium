/**
 * Code generation service integration for Studio.
 * In the browser, code generation is done via HTTP POST to a local codegen server.
 * The server can be started via: pnpm codegen:start (which runs CodegenCli in server mode).
 * @see specs/008-core-editor-features/contracts/codegen-api.md
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

/**
 * Browser-compatible proxy that calls the codegen HTTP API.
 * For CLI usage, use CodegenServiceProxy from '@rune-langium/codegen/node'.
 */
export class BrowserCodegenProxy {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl =
      baseUrl ??
      (typeof import.meta !== 'undefined' &&
        (import.meta as unknown as Record<string, Record<string, string>>).env?.[
          'VITE_CODEGEN_URL'
        ]) ??
      DEFAULT_CODEGEN_URL;
  }

  async generate(
    request: CodeGenerationRequest,
    signal?: AbortSignal
  ): Promise<CodeGenerationResult> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal
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
      throw new Error(`Code generation failed (HTTP ${response.status})`);
    }

    const result = (await response.json()) as Omit<CodeGenerationResult, 'language'>;
    return { language: request.language, ...result };
  }

  async listLanguages(): Promise<Array<{ id: string; class: string }>> {
    const response = await fetch(`${this.baseUrl}/api/languages`);
    const data = (await response.json()) as { languages: Array<{ id: string; class: string }> };
    return data.languages;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`, {
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
