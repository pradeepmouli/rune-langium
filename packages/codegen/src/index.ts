// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * @rune-langium/codegen — Public API entry point.
 *
 * This is the sole public surface of the package. Internal modules
 * (cycle-detector, topo-sort, diagnostics, etc.) are not exported.
 *
 * FR-001 (public API surface).
 */

import type { LangiumDocument } from 'langium';
import type { GeneratorOutput, GeneratorOptions } from './types.js';
import { runGenerate } from './generator.js';

export type {
  GeneratorOptions,
  GeneratorOutput,
  GeneratorDiagnostic,
  SourceMapEntry,
  Target,
  GeneratedFunc
} from './types.js';
export { GeneratorError } from './types.js';

/**
 * Generate code from one or more parsed Langium documents.
 *
 * This is the primary entry point for the code generator. It accepts
 * a single document or an array of documents and normalizes them before
 * passing to the internal generator pipeline.
 *
 * @param documents - One or more parsed Langium documents with resolved ASTs.
 * @param options - Optional generator options (target, strict, headerComment).
 * @returns Array of GeneratorOutput sorted by relativePath ascending.
 * @throws GeneratorError when strict mode is enabled and any error diagnostic is produced.
 *
 * @example
 * ```ts
 * import { generate } from '@rune-langium/codegen';
 * const outputs = generate(doc, { target: 'zod' });
 * ```
 */
export function generate(
  documents: LangiumDocument | LangiumDocument[],
  options?: GeneratorOptions
): GeneratorOutput[] {
  const docs = Array.isArray(documents) ? documents : [documents];
  return runGenerate(docs, options ?? {});
}
