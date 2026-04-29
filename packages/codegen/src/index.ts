// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * @packageDocumentation
 *
 * Generate TypeScript, Zod, JSON Schema, and form-preview metadata from parsed
 * Rune DSL documents.
 *
 * @remarks
 * Use `generate()` when you need emitted files for a concrete target, and
 * `generatePreviewSchemas()` when UI tooling needs structured field metadata and
 * source maps for a selected data type. This package expects parsed Langium
 * documents from `@rune-langium/core`.
 */

/**
 * @rune-langium/codegen — Public API entry point.
 *
 * This module is the primary library entry point for the package. Internal
 * modules (cycle-detector, topo-sort, diagnostics, etc.) are not exported from
 * the public ESM surface here; the package also ships a CLI via `bin`.
 *
 * FR-001 (public API surface).
 */

import type { LangiumDocument } from 'langium';
import type { GeneratorOutput, GeneratorOptions, GeneratePreviewSchemaOptions } from './types.js';
import { runGenerate } from './generator.js';
import { generatePreviewSchemas as runGeneratePreviewSchemas } from './preview-schema.js';

export type {
  FormPreviewSchema,
  GeneratePreviewSchemaOptions,
  GeneratorOptions,
  GeneratorOutput,
  GeneratorDiagnostic,
  PreviewField,
  PreviewFieldKind,
  PreviewSourceMapEntry,
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

/**
 * Generate structured form-preview schemas from one or more parsed Langium documents.
 *
 * The returned schemas preserve field metadata and source-map information so
 * Studio can render an inspector/form preview and navigate back to source.
 *
 * @param documents - One or more parsed Langium documents with resolved ASTs.
 * @param options - Optional preview generation options such as `targetId` and `maxDepth`.
 * @returns Array of `FormPreviewSchema` objects sorted by target id.
 */
export function generatePreviewSchemas(
  documents: LangiumDocument | LangiumDocument[],
  options?: GeneratePreviewSchemaOptions
) {
  return runGeneratePreviewSchemas(documents, options);
}
