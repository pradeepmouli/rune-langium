/**
 * Code generation service integration for Studio.
 * Re-exports the shared CodegenServiceProxy and provides a configured singleton.
 * @see specs/008-core-editor-features/contracts/codegen-api.md
 */

import { CodegenServiceProxy, KNOWN_GENERATORS } from '@rune-langium/codegen';
export type {
  CodeGenerationRequest,
  CodeGenerationResult,
  GeneratedFile
} from '@rune-langium/codegen';
export { CodegenServiceProxy, KNOWN_GENERATORS };

/** Default codegen service URL. Override via VITE_CODEGEN_URL env var. */
const DEFAULT_CODEGEN_URL = 'http://localhost:8080';

let _instance: CodegenServiceProxy | undefined;

/**
 * Get the singleton CodegenServiceProxy instance.
 */
export function getCodegenService(): CodegenServiceProxy {
  if (!_instance) {
    const url =
      (typeof import.meta !== 'undefined' &&
        (import.meta as unknown as Record<string, Record<string, string>>).env?.[
          'VITE_CODEGEN_URL'
        ]) ||
      DEFAULT_CODEGEN_URL;
    _instance = new CodegenServiceProxy(url);
  }
  return _instance;
}
