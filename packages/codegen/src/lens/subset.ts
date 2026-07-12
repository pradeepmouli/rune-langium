// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * The single source of truth for the lens's supported `RosettaExpression`
 * subset `S`. Widening this list is a deliberate act — add a round-trip
 * fixture (Task 4) and a `render-ts.ts` case (Task 2) in the same change.
 *
 * Deliberately excludes: `RosettaCountOperation`, `OneOfOperation`,
 * `ChoiceOperation` (deferred — no confirmed-reversible TS shape yet),
 * `SwitchOperation`/`ThenOperation` (irreversible lowering, per the spec's
 * Phase 1 seeding rule: reversibility, not transpiler coverage, is the
 * boundary), any unary "not" (no such `$type` exists in the shipped
 * grammar — do not invent one), and `RosettaDeepFeatureCall` (its TS
 * projection is byte-identical to `RosettaFeatureCall`'s — both render to
 * `receiver?.feature`, since TS has no `->` vs `->>` distinction — so it
 * can never round-trip faithfully; parse-back can only ever reconstruct
 * `RosettaFeatureCall`).
 *
 * Also covers `Operation.expression` and `ShortcutDeclaration.expression`
 * bodies (Rune func operations/aliases) — subset `S` is expression-shaped,
 * not holder-shaped, so it applies uniformly wherever a bare
 * `RosettaExpression` is rendered/parsed, whether the holder is a
 * `Condition` or a `RosettaFunction`'s operation/alias. See
 * docs/superpowers/plans/2026-07-12-expression-language-lens-phase2.md for
 * the audit that confirmed this (function-body-corpus-sweep.test.ts).
 *
 * Phase 3 note: subset `S` now also has a confirmed Python projection via
 * `lens/python/`. Every one of the 12 types is representable in Python with
 * no `$type`-level changes — each type's Python idiom is documented directly
 * in `render-py.ts`'s own per-case comments. A real-corpus sweep confirmed
 * Python coverage matches TypeScript's closely across `Condition`,
 * `Operation`, and `ShortcutDeclaration` bodies; see
 * docs/superpowers/plans/2026-07-12-expression-language-lens-phase3.md for
 * the exact measured counts — those are a point-in-time snapshot of the
 * `.resources/` corpus, not a live-updated figure, so they are recorded
 * there rather than here.
 */
export const SUBSET_S_TYPES = [
  'ComparisonOperation',
  'EqualityOperation',
  'LogicalOperation',
  'ArithmeticOperation',
  'RosettaExistsExpression',
  'RosettaAbsentExpression',
  'RosettaFeatureCall',
  'RosettaBooleanLiteral',
  'RosettaIntLiteral',
  'RosettaNumberLiteral',
  'RosettaStringLiteral',
  'RosettaSymbolReference'
] as const;

export type SubsetSType = (typeof SUBSET_S_TYPES)[number];

const SUBSET_S_SET: ReadonlySet<string> = new Set(SUBSET_S_TYPES);

/** True if `node.$type` is one of the 12 types Phase 1 supports. */
export function isInSubsetS(node: { $type: string }): boolean {
  return SUBSET_S_SET.has(node.$type);
}
