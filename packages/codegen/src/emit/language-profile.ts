// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { GeneratorOutput, Target } from '../types.js';
import type { NamespaceRegistry } from './namespace-registry.js';

/**
 * Declarative target-level metadata for packaging (019 spec §3.2).
 *
 * A `LanguageProfile<T>` tells `GenericModelEmitter` how to assemble
 * whole-model artifacts for target `T`: how to render the barrel /
 * index file, how to concatenate per-namespace outputs into a single
 * file, what shared sidecar artifacts (runtime helpers, manifests,
 * READMEs) ride alongside the core outputs, and what size limits
 * apply to the `single-file` layout.
 *
 * **Profiles exist independently of `NamespaceEmitter`.** Targets that
 * have no per-namespace mode (Excel, GraphQL — both `WholeModelEmitter`)
 * still ship a `LanguageProfile` so their hand-rolled emitters can
 * delegate sidecar generation to a uniform mechanism.
 *
 * Phase 0.5.1 ships only the interface; concrete Profile instances
 * land in 0.5.2 (Zod), 0.5.3 (TypeScript), 0.5.4 (JSON Schema), and
 * Phases 1-3 (Excel, SQL, Markdown, GraphQL).
 */
export interface LanguageProfile<T extends Target = Target> {
  readonly target: T;

  /**
   * Output extension for this target's primary files. Mirrors the
   * value in `TARGET_DESCRIPTORS[target].extension` — duplicated here
   * so emitter implementations don't need a back-reference to the
   * registry.
   */
  readonly extension: string;

  /**
   * Render an index / barrel artifact that references every per-namespace
   * output. Examples: Zod re-export module, TypeScript barrel, Markdown
   * `index.md` TOC. Return `undefined` to signal the target has no
   * meaningful barrel concept (JSON Schema treats single-file as
   * canonical bundling; SQL has no module system).
   *
   * Called by `GenericModelEmitter` only when the resolved layout is
   * `'barrel'` (or future barrel-like values).
   */
  makeBarrel(
    perNamespaceOutputs: ReadonlyArray<GeneratorOutput>,
    registry: NamespaceRegistry
  ): GeneratorOutput | undefined;

  /**
   * Produce a single bundled artifact from the per-namespace outputs.
   * Used when the resolved layout is `'single-file'`. The exact shape
   * is target-specific: Zod/TS concatenate with proper imports/exports
   * inlined; JSON Schema collapses every type into a `$defs` map.
   *
   * Subject to {@link singleFileLimits} — `GenericModelEmitter` checks
   * the size against the profile's limits before calling this and
   * substitutes a `single-file-too-large` error diagnostic if exceeded.
   */
  concatenate(perNamespaceOutputs: ReadonlyArray<GeneratorOutput>, registry: NamespaceRegistry): GeneratorOutput;

  /**
   * Shared sidecar artifacts that ride alongside every whole-model
   * emission. Examples: Zod's `runtime.zod.ts` (the helpers extracted
   * via `suppressBoilerplate`), an Excel workbook's `manifest.json`,
   * a README explaining the bundle layout. Return an empty array when
   * the target has no sidecars.
   *
   * Called by `GenericModelEmitter` for both `'barrel'` and
   * `'single-file'` layouts. For `'single-file'`, sidecars produce a
   * multi-output response (zip) instead of the bare single artifact.
   */
  makeSharedArtifacts(
    perNamespaceOutputs: ReadonlyArray<GeneratorOutput>,
    registry: NamespaceRegistry
  ): GeneratorOutput[];

  /**
   * Per-target guardrails for `single-file` layout (019 spec §10.2).
   *
   * When `concatenate()` is about to emit and either limit is exceeded,
   * `GenericModelEmitter` returns a single `GeneratorOutput` carrying
   * a fatal `severity: 'error'`, `code: 'single-file-too-large'`
   * diagnostic instead of the concatenated content. Strict-mode
   * callers (CLI, /api/codegen) see a `GeneratorError`; non-strict
   * callers see the diagnostic in the returned output.
   *
   * Defaults: Zod/TS profiles set `{ maxNamespaces: 50, maxBytes: 1_048_576 }`.
   * JSON Schema / SQL profiles omit limits since single-file is their
   * canonical shape and bytes are reasonable for typical models.
   *
   * `undefined` = no limits.
   */
  readonly singleFileLimits?: {
    maxNamespaces?: number;
    maxBytes?: number;
  };
}
