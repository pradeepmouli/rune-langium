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
 * boundary), and any unary "not" (no such `$type` exists in the shipped
 * grammar — do not invent one).
 */
export const SUBSET_S_TYPES = [
  'ComparisonOperation',
  'EqualityOperation',
  'LogicalOperation',
  'ArithmeticOperation',
  'RosettaExistsExpression',
  'RosettaAbsentExpression',
  'RosettaFeatureCall',
  'RosettaDeepFeatureCall',
  'RosettaBooleanLiteral',
  'RosettaIntLiteral',
  'RosettaNumberLiteral',
  'RosettaStringLiteral',
  'RosettaSymbolReference'
] as const;

export type SubsetSType = (typeof SUBSET_S_TYPES)[number];

const SUBSET_S_SET: ReadonlySet<string> = new Set(SUBSET_S_TYPES);

/** True if `node.$type` is one of the 13 types Phase 1 supports. */
export function isInSubsetS(node: { $type: string }): boolean {
  return SUBSET_S_SET.has(node.$type);
}
