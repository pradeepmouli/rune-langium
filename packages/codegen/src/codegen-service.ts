/**
 * Code generation service proxy.
 * HTTP client that forwards code generation requests to a rosetta-code-generators
 * service endpoint. The actual generation happens in a separate Java process.
 * @see specs/008-core-editor-features/contracts/codegen-api.md
 */

import type { CodeGenerationRequest, CodeGenerationResult, GenerationError } from './types.js';

/**
 * Proxy client for the rosetta-code-generators HTTP service.
 * Forwards generate requests and returns results.
 */
export class CodegenServiceProxy {
  constructor(private readonly baseUrl: string) {}

  /**
   * Generate code from .rosetta model files.
   */
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
      if (response.status === 400) {
        throw new Error(
          `Invalid request: unknown language or bad request (HTTP ${response.status})`
        );
      }
      throw new Error(`Code generation service error (HTTP ${response.status})`);
    }

    const result = (await response.json()) as Omit<CodeGenerationResult, 'language'>;
    return { language: request.language, ...result };
  }

  /**
   * Check if the code generation service is available.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'OPTIONS',
        signal: AbortSignal.timeout(3000)
      });
      return response.ok || response.status === 405 || response.status === 204;
    } catch {
      return false;
    }
  }
}
