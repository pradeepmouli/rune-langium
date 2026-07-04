// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Public API for inbound code generation — `@rune-langium/codegen/import`
 * (spec 021 Phase 2 Addendum's subpath restructure).
 *
 * `importModel(source, options)` is the primary entry point. Phase 1
 * implements `from: 'json-schema'`; Phase 2 adds `from: 'openapi'` (OAS
 * 3.0.x / 3.1, JSON or YAML). The remaining sources named in spec.md's CLI
 * surface (`typescript` | `sql` | `python`) are follow-up work (US2-US4)
 * and are rejected here with a clear "not yet supported" error, matching
 * the CLI's own error contract (spec.md's CLI Surface section: "the other
 * values error with 'not yet supported'").
 *
 * Also re-exports the `SourceModel`/`ConstraintIR` type vocabulary
 * (source-model.ts), import diagnostics (diagnostics.ts), and the CLI's
 * `runImport` action body (cli.ts) — the full inbound public surface the
 * `/import` subpath is required to carry.
 */

import { renderModel } from '../emit/rosetta/rosetta-render-core.js';
import { buildModel } from './ast-builder.js';
import { readJsonSchema } from './sources/json-schema-reader.js';
import { readOpenApi, parseOpenApiDocument } from './sources/openapi-reader.js';
import type { ImportDiagnostic } from './diagnostics.js';
import type { SourceModel } from './source-model.js';

export { runImport } from './cli.js';
export type { ImportCommandOptions } from './cli.js';
export type { ImportDiagnostic, ImportDiagnosticOpts } from './diagnostics.js';
export { pushDiagnostic, hasFatalImportDiagnostics } from './diagnostics.js';
export type {
  SourceKind,
  SourceCardinality,
  Literal,
  ConstraintIR,
  SourceAttribute,
  SourceType,
  SourceEnumValue,
  SourceEnum,
  SourceModel
} from './source-model.js';

export type ImportSourceKind = 'json-schema' | 'openapi' | 'typescript' | 'sql' | 'python';

export interface ImportOptions {
  from: ImportSourceKind;
  /** Overrides namespace derivation (e.g. from a JSON Schema `$id`). */
  namespace?: string;
  /** Suppress synonym annotations entirely. Default: emit (MVP round-trip-fidelity default). */
  synonyms?: boolean;
  /** Structural import only — skip expression translation (constraints produce no conditions). Default: translate. */
  conditions?: boolean;
  /**
   * How to handle an untranslatable source construct. Default: `'stub'`
   * (emit a stub condition + diagnostic — the current, and only
   * implemented, behavior). `'skip'`/`'error'` are recorded here as the
   * spec'd CLI surface but not yet implemented by the translation layer —
   * selecting them is rejected with a clear error rather than silently
   * behaving like `'stub'`.
   */
  onUntranslatable?: 'stub' | 'skip' | 'error';
}

export interface ImportResult {
  /** The rendered `.rune` source text — guaranteed to parse with zero errors (the inbound hard invariant). */
  text: string;
  model: SourceModel;
  diagnostics: ImportDiagnostic[];
}

const SUPPORTED_SOURCES: ReadonlySet<ImportSourceKind> = new Set(['json-schema', 'openapi']);

/**
 * Imports a source-format document into a `.rune` model.
 *
 * @param source - The raw source text: JSON Schema document text for
 *   `from: 'json-schema'`; OpenAPI 3.0.x/3.1 document text (JSON or YAML,
 *   auto-detected) for `from: 'openapi'`.
 * @param options - Import options; `from` selects the source reader.
 */
export function importModel(source: string, options: ImportOptions): ImportResult {
  if (!SUPPORTED_SOURCES.has(options.from)) {
    throw new Error(
      `rune-codegen import: --from '${options.from}' is not yet supported (implemented: 'json-schema', 'openapi'; ` +
        `'typescript'/'sql'/'python' are follow-up work).`
    );
  }
  if (options.onUntranslatable !== undefined && options.onUntranslatable !== 'stub') {
    throw new Error(
      `rune-codegen import: --on-untranslatable '${options.onUntranslatable}' is not yet supported ` +
        `(Phase 1 always stubs an untranslatable construct + emits a diagnostic).`
    );
  }

  const readerOptions = {
    ...(options.namespace !== undefined && { namespace: options.namespace }),
    ...(options.conditions === false && { skipConditions: true })
  };

  const { model, diagnostics: readerDiagnostics } =
    options.from === 'openapi'
      ? readOpenApi(parseOpenApiDocument(source), readerOptions)
      : readJsonSchema(parseJsonSchemaSource(source) as never, readerOptions);

  const built = buildModel(model, { emitSynonyms: options.synonyms ?? true });
  const rendered = renderModel({ name: model.namespace, version: '0.0.0', elements: built.elements as never[] });
  const text = splice(rendered, built.synonymSourceDeclaration);

  return { text, model, diagnostics: [...readerDiagnostics, ...built.diagnostics] };
}

/** `from: 'json-schema'` only ever accepted strict JSON (spec.md's Source Parser Dependencies table lists YAML as OpenAPI-only, T4's addition) — preserved unchanged here rather than widened to `parseOpenApiDocument`'s JSON-or-YAML auto-detection. */
function parseJsonSchemaSource(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch (err) {
    throw new Error(
      `rune-codegen import: input is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/** Splices the `synonym source <Name>` declaration in right after `version "..."`, mirroring renderModel's own hand-assembled namespace/version lines (see ast-builder.ts / synonym-builder.ts's module docs — no renderNode case exists for RosettaSynonymSource). */
function splice(rendered: string, declaration: string | undefined): string {
  if (!declaration) return rendered;
  const lines = rendered.split('\n');
  const versionIdx = lines.findIndex((l) => l.startsWith('version '));
  lines.splice(versionIdx + 1, 0, '', declaration);
  return lines.join('\n');
}
