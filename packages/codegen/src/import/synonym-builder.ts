// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * synonym-builder — attach `[synonym <Source> value "..."]` annotations
 * recording each imported node's original source-format name (spec.md
 * "Synonym Emission").
 *
 * Three distinct node shapes, grounded against the grammar + the real
 * renderer (`rosetta-render-core.ts` — never modified by this effort):
 *
 *  - `Data.synonyms` (type-level) is `RosettaClassSynonym[]` — simpler
 *    shape, `value: {name}` directly, no `body` wrapper (grammar:
 *    `Data: ... ClassSynonyms* ...`, `fragment ClassSynonyms: synonyms+=
 *    RosettaClassSynonym`).
 *  - `Attribute.synonyms` AND `Enumeration.synonyms` (attribute- and
 *    enum-level) are BOTH `RosettaSynonym[]` — the grammar's `Attribute`
 *    and `Enumeration` rules both use `fragment Synonyms: synonyms+=
 *    RosettaSynonym`, distinct from `Data`'s `ClassSynonyms`. `RosettaSynonym`
 *    requires a `body` (`RosettaSynonymBody`); for the plain "record the
 *    source field name" case that's `body: { values: [{ name: sourceKey }] }`
 *    (renders as `value "sourceKey"` — confirmed against
 *    render-annotations-synonyms.test.ts's "renders an enum-level
 *    RosettaSynonym" fixture, whose $type is 'RosettaSynonym' despite the
 *    test name — it's actually attribute/enum shape, Data's own annotation
 *    is the separate 'RosettaClassSynonym' case in the same file).
 *    IMPORTANT: `render-synonym-body.ts`'s `renderSynonymBody` (and
 *    `rosetta-render-core.ts`'s `renderSynonym`) return `null`/throw when
 *    `body.values` is empty or absent — the synonym silently disappears
 *    (CST-fallback contract) rather than emitting a malformed `value `. This
 *    module MUST always populate `body.values` with at least one entry.
 *  - `RosettaEnumValue.enumSynonyms` (per-enum-value) is `RosettaEnumSynonym[]`
 *    — a REQUIRED `synonymValue: string` field (not a `values` array), used
 *    for the enum-value-level value-transform mapping (spec.md's `ACT_360`
 *    example).
 *
 * `RosettaSynonymSource` (the `synonym source <Name>` declaration itself)
 * has NO `renderNode` case — verified empirically (constraint-translator's
 * sibling grounding note in .superpowers/sdd/inbound-report.md). The
 * declaration line is therefore assembled as literal text by
 * `buildSynonymSourceDeclaration` below and spliced in by the AST-builder /
 * `index.ts`'s `importModel`, the same way `renderModel` itself
 * hand-assembles its `namespace`/`version` lines rather than routing them
 * through `renderNode`.
 */

import { escapeString } from '../emit/rosetta/rosetta-render-core.js';
import type { SourceKind } from './source-model.js';

/** A `RosettaClassSynonym`-shaped plain object (Data/type-level). */
export interface ClassSynonymNode {
  $type: 'RosettaClassSynonym';
  sources: Array<{ $refText: string }>;
  value?: { name: string };
  metaValue?: undefined;
}

/** A `RosettaSynonym`-shaped plain object (Attribute/Enumeration-level). */
export interface SynonymNode {
  $type: 'RosettaSynonym';
  sources: Array<{ $refText: string }>;
  body: { values: Array<{ name: string }> };
}

/** A `RosettaEnumSynonym`-shaped plain object (per-enum-value). */
export interface EnumSynonymNode {
  $type: 'RosettaEnumSynonym';
  sources: Array<{ $refText: string }>;
  synonymValue: string;
}

function sourceRef(source: SourceKind): { $refText: string } {
  return { $refText: source };
}

/** `[synonym <Source> value "<sourceKey>"]` on a `Data` (type-level annotation). */
export function buildClassSynonym(source: SourceKind, sourceKey: string): ClassSynonymNode {
  return {
    $type: 'RosettaClassSynonym',
    sources: [sourceRef(source)],
    value: { name: sourceKey }
  };
}

/** `[synonym <Source> value "<sourceKey>"]` on an `Attribute` or `Enumeration` (grammar's shared `RosettaSynonym`). */
export function buildAttributeSynonym(source: SourceKind, sourceKey: string): SynonymNode {
  return {
    $type: 'RosettaSynonym',
    sources: [sourceRef(source)],
    body: { values: [{ name: sourceKey }] }
  };
}

/** `[synonym <Source> value "<sourceValue>"]` on a `RosettaEnumValue` — records the original (possibly non-ValidID-safe) source enum literal. */
export function buildEnumValueSynonym(source: SourceKind, sourceValue: string): EnumSynonymNode {
  return {
    $type: 'RosettaEnumSynonym',
    sources: [sourceRef(source)],
    synonymValue: sourceValue
  };
}

/**
 * The `synonym source <Name>` declaration as literal `.rune` text — NOT
 * routed through `renderNode` (see module doc: no case exists for
 * `RosettaSynonymSource`). Callers splice this in exactly where
 * `renderModel` places its own hand-assembled `namespace`/`version` lines.
 */
export function buildSynonymSourceDeclaration(source: SourceKind): string {
  return `synonym source ${source}`;
}

/** Escapes a source-key string for embedding directly in `.rune` text (re-export for callers assembling raw text, e.g. diagnostics messages). */
export { escapeString };
