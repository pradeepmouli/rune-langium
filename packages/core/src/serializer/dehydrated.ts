// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { AstNode } from 'langium';

// ---------------------------------------------------------------------------
// Dehydrated<T> — lossless editable wire model
// ---------------------------------------------------------------------------

interface ReferenceShape {
  readonly $refText: string;
}

type LangiumRuntimeFields = '$container' | '$containerProperty' | '$containerIndex' | '$cstNode' | '$document';

type DehydratedField<F> =
  NonNullable<F> extends ReferenceShape
    ? { $refText: string } | Extract<F, undefined | null>
    : F extends Array<infer E extends AstNode>
      ? Dehydrated<E>[]
      : NonNullable<F> extends AstNode
        ? Dehydrated<NonNullable<F>> | Extract<F, undefined | null>
        : F;

/**
 * Lossless editable wire model for a Langium AST node.
 *
 * Strips runtime-only internals ($container, $cstNode, etc.) and converts
 * every Reference<T> to { $refText: string }. All semantic fields are
 * preserved and made mutable for in-place editing.
 *
 * This is the canonical substrate for the Rune editable store.
 *
 * KNOWN FOLLOW-UP (verified during rune-langium spec 021 Phase 2, 2026-07):
 * this type has three real gaps, each independently confirmed against a
 * concrete AST node before being worked around downstream — worth fixing
 * here rather than re-discovering per call site:
 *
 *  1. **Non-distributive over a union type parameter.** `Dehydrated<T
 *     extends AstNode>` reads `keyof T` in its mapped-type body — invoking
 *     it directly on a union (e.g. `Dehydrated<RosettaExpression>`, ~48
 *     interface members) does NOT distribute member-wise the way
 *     `Dehydrated<X> | Dehydrated<Y>` would; it collapses to the fields
 *     common to every member ($type/$namespace/$cstRange only), silently
 *     dropping everything else. This is already live-latent in this
 *     repo's own consumer: `packages/codegen/src/emit/rosetta/
 *     render-expression.ts`'s `DehydratedExpression = Dehydrated<
 *     RosettaExpression> | RosettaExpression` has the identical collapse —
 *     it only "works" there because the consuming code immediately casts
 *     to an internal loosely-typed shape and never relies on the
 *     collapsed type's fields. Fix: make this type distributive (`T
 *     extends AstNode ? {...} : never`), or require every union-typed call
 *     site to build its own distributed alias (the workaround
 *     `packages/codegen/src/import/constraint-translator.ts` currently
 *     uses).
 *  2. **`Array<Reference<X>>` fields are never dehydrated.**
 *     `DehydratedField<F>`'s reference-shape branch only matches a BARE
 *     `Reference<X>`; its array branch only matches `Array<AstNode>`. A
 *     field typed `Array<Reference<X>>` (e.g. the grammar's
 *     `ChoiceOperation.attributes`, and 7 other fields — every synonym
 *     node's `sources`, `RosettaCorpus.corpusList`, `RosettaReport.
 *     eligibilityRules`, two `superSources` fields) matches neither branch
 *     and passes through unchanged — a REAL resolved `Reference[]`, not
 *     `{$refText}[]`, unlike every other reference-shaped field on the
 *     same node.
 *  3. **Every field becomes a REQUIRED key of type `V | undefined`, never
 *     an optional key.** The enclosing mapped type
 *     (`-readonly [K in Exclude<keyof T, ...>]: DehydratedField<F>`) is a
 *     non-homomorphic key remap, which drops the `?` modifier — even for
 *     fields optional on the original interface (`Condition.definition?`,
 *     `Data.superType?`, `RosettaEnumeration.parent?`, etc.). A caller's
 *     conditional-spread idiom (`...(x !== undefined && { x })`, which
 *     OMITS the key) no longer type-checks against the resulting type,
 *     even though it is runtime-safe.
 *
 * See `packages/codegen/src/import/constraint-translator.ts` and
 * `synonym-builder.ts` for the current per-call-site workarounds (narrow,
 * documented `Omit<Dehydrated<T>, field> & { field: corrected }`
 * intersections) — none of this file's callers currently depend on the
 * gaps above being present, so fixing them here should be additive.
 */
export type Dehydrated<T extends AstNode> = {
  readonly $type: T['$type'];
  readonly $namespace?: string;
  readonly $cstRange?: { offset: number; end: number };
} & {
  -readonly [K in Exclude<keyof T, LangiumRuntimeFields | '$type'>]: DehydratedField<T[K]>;
};
