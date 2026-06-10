// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * @packageDocumentation
 *
 * Parse `.rosetta` source into typed ASTs, build cross-file workspaces, and
 * serialize models back to source text.
 *
 * @remarks
 * Use `parse()` for a single self-contained document, `parseWorkspace()` when
 * files reference each other, and `createRuneDslServices()` when you need raw
 * Langium services for custom tooling. The serializer exports are best for
 * AST-driven workflows, tests, and code transformations that do not need to
 * preserve original formatting.
 */

// Core AST types + generated domain surface (mutators, converters, domain interfaces)
export * from './generated/ast.js';
export * from './generated/domain.js';
// Namespace-merged ops: import { DomainOps } from '@rune-langium/core' → DomainOps.Data.getAttributes(node)
// Requires langium-zod >= 0.8.0 to regenerate.
export * as DomainOps from './generated/domain-ops.js';

// Parse API
export { parse, parseWorkspace } from './api/parse.js';
export type { ParseResult } from './api/parse.js';

// Services
export { createRuneDslServices, RuneDslModule, RuneDslSharedModule } from './services/rune-dsl-module.js';
export type { RuneDslServices } from './services/rune-dsl-module.js';
export { RuneDslIndexManager } from './services/rune-dsl-index-manager.js';
export { RuneDslLinker } from './services/rune-dsl-linker.js';
export type { DeferredModelProvider } from './services/rune-dsl-linker.js';
export { RuneDslScopeProvider } from './services/rune-dsl-scope-provider.js';
export { RuneDslValidator } from './services/rune-dsl-validator.js';
export { RuneStoreHydrator } from './services/rune-store-hydrator.js';
export { RuneDslParser, createRuneDslParser, insertImplicitBrackets } from './services/rune-dsl-parser.js';

// Generated module essentials — needed for LSP server integration
export { RuneDslLanguageMetaData } from './generated/module.js';
export { RuneDslGeneratedModule, RuneDslGeneratedSharedModule } from './generated/module.js';

// Domain substrate
export type { Dehydrated } from './serializer/dehydrated.js';

// Source adapters
export { parsedAdapter } from './adapters/parsed-adapter.js';
export { curatedAdapter } from './adapters/curated-adapter.js';

// Serializer
export { serializeModel, serializeElement, serializeModels } from './serializer/rosetta-serializer.js';
export { RUNE_SERIALIZE_OPTIONS, runeBigIntReplacer, serializeRuneModel } from './serializer/rune-serialize.js';
export { preserveCstText } from './serializer/preserve-cst-text.js';
export { deserializeRuneModel, hydrateModelDocument } from './serializer/hydrate-model-document.js';
export type { HydrateServices, HydrateOptions } from './serializer/hydrate-model-document.js';

// Utility functions
export { isOptional, isSingular, isPlural, isRequired, toConstraintString } from './utils/cardinality-utils.js';
export { getOptions, getEffectiveConditions } from './utils/choice-utils.js';
export {
  hasGeneratedInput,
  setGeneratedInputIfAbsent,
  getFunctionInputs,
  getFunctionOutput
} from './utils/expression-utils.js';

// Structural analysis (spec 2026-05-14 §5.2 — cross-namespace dep graph)
export {
  getElementNamespace,
  collectNamespaceDependencies,
  closeNamespaceDependencies
} from './analysis/cross-namespace-refs.js';

// Naming utilities
export { qualifiedExportPath } from './naming/qualified-export-path.js';
export { namespaceFromSource, namespaceFromModelName } from './naming/namespace.js';

// Collection utilities
export { indexById, fromIndex } from './collections/index-by-id.js';
