// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Rune → Python projection over subset `S` (see ../subset.ts).
 *
 * Mirrors `../typescript/render-ts.ts`'s precedence-tier-aware structure
 * exactly — Python's operator precedence has the same RELATIVE ordering as
 * TS's for the 4 binary tiers this lens emits (multiplicative tightest,
 * then additive, then comparison, then equality, then `and`, then `or`
 * loosest), so the same `r()`/`rTight()` parenthesization logic applies
 * unchanged; only the token tables and two per-`$type` idioms differ
 * (exists/absent → `is not None`/`is None`; feature-call → `getattr(...)`,
 * since Python has no `?.`-equivalent operator — verified via real
 * tree-sitter-python parses during Phase 3 planning, see the plan's Global
 * Constraints for the full reasoning).
 *
 * Returns `null` for any node outside `S` — never an approximate rendering.
 */
import type { RosettaExpression } from '@rune-langium/core';
import { isInSubsetS } from '../subset.js';

type AnyNode = RosettaExpression & Record<string, unknown>;

const COMPARISON_PY: Record<string, string> = { '<': '<', '<=': '<=', '>': '>', '>=': '>=' };
const EQUALITY_PY: Record<string, string> = { '=': '==', '<>': '!=' };
const LOGICAL_PY: Record<string, string> = { and: 'and', or: 'or' };
const ARITHMETIC_PY: Record<string, string> = { '+': '+', '-': '-', '*': '*', '/': '/' };

/** Same tier table as render-ts.ts's precedenceTier — Python's relative operator precedence matches TS's for these 4 tiers. */
function precedenceTier(kind: string, operator: unknown): number | null {
  switch (kind) {
    case 'LogicalOperation':
      return operator === 'or' ? 1 : 2;
    case 'EqualityOperation':
      return 3;
    case 'ComparisonOperation':
      return 4;
    case 'ArithmeticOperation':
      return operator === '+' || operator === '-' ? 5 : 6;
    default:
      return null;
  }
}

/** Identical logic to render-ts.ts's r() — see that file's docstring for the same-tier-right-needs-parens reasoning. */
function r(child: RosettaExpression, parentTier: number, side: 'left' | 'right'): string {
  const node = child as AnyNode;
  const text = renderPy(child);
  if (text === null) throw new UnsupportedInChild();
  const childTier = precedenceTier(node.$type, node['operator']);
  if (childTier === null) return text;
  const needsParens = childTier < parentTier || (childTier === parentTier && side === 'right');
  return needsParens ? `(${text})` : text;
}

/** Identical logic to render-ts.ts's rTight() — used only for RosettaFeatureCall's receiver, since attribute/call access binds tighter than every tier in `precedenceTier`. */
function rTight(child: RosettaExpression): string {
  const node = child as AnyNode;
  const text = renderPy(child);
  if (text === null) throw new UnsupportedInChild();
  const needsParens =
    node.$type === 'LogicalOperation' ||
    node.$type === 'ComparisonOperation' ||
    node.$type === 'EqualityOperation' ||
    node.$type === 'ArithmeticOperation';
  return needsParens ? `(${text})` : text;
}

/**
 * Render `child` as the argument/left/right of a Python comparison-family
 * construct (ComparisonOperation, EqualityOperation, RosettaExistsExpression,
 * RosettaAbsentExpression). Python's `<`/`<=`/`>`/`>=`/`==`/`!=`/`is`/`is not`
 * are ALL the same `comparison_operator` grammar production and CHAIN when
 * unparenthesized (`a < b < c` means `(a<b) and (b<c)`, not `(a<b)<c` —
 * confirmed via a real tree-sitter-python parse during the PR #388 review
 * fix). So a nested ComparisonOperation/EqualityOperation/
 * RosettaExistsExpression/RosettaAbsentExpression child must ALWAYS be
 * parenthesized here, regardless of tier/side — `exists`/`absent` render as
 * `is not None`/`is None`, which use the same `is`/`is not` tokens that
 * chain in that same grammar production, so they share the hazard even
 * though `precedenceTier()` treats them as atomic (no binary tier of their
 * own). This is unlike TS, where `<` and `===` share no such chaining
 * ambiguity. Every other child type (arithmetic, logical, atomic) has no
 * chaining hazard and uses the normal tier-based `r()`.
 */
function rComparisonFamily(child: RosettaExpression, parentTier: number, side: 'left' | 'right'): string {
  const node = child as AnyNode;
  if (
    node.$type === 'ComparisonOperation' ||
    node.$type === 'EqualityOperation' ||
    node.$type === 'RosettaExistsExpression' ||
    node.$type === 'RosettaAbsentExpression'
  ) {
    const text = renderPy(child);
    if (text === null) throw new UnsupportedInChild();
    return `(${text})`;
  }
  return r(child, parentTier, side);
}

class UnsupportedInChild extends Error {}

export function renderPy(node: RosettaExpression): string | null {
  try {
    return dispatch(node as AnyNode);
  } catch (e) {
    if (e instanceof UnsupportedInChild) return null;
    throw e;
  }
}

function dispatch(node: AnyNode): string {
  if (!isInSubsetS(node)) throw new UnsupportedInChild();

  switch (node.$type) {
    case 'RosettaBooleanLiteral':
      return node['value'] ? 'True' : 'False';
    case 'RosettaIntLiteral':
    case 'RosettaNumberLiteral':
      return String(node['value']);
    case 'RosettaStringLiteral':
      return JSON.stringify(String(node['value']));
    case 'RosettaSymbolReference': {
      const symbol = node['symbol'] as { $refText?: string } | undefined;
      if (node['explicitArguments']) throw new UnsupportedInChild();
      if (!symbol?.$refText) throw new UnsupportedInChild();
      // A qualified (dotted) or ^-escaped $refText (Rune's QualifiedName cross-ref
      // grammar and reserved-keyword escaping — see render-expression.ts's
      // escapeId()) is not a single valid Python identifier: a dotted name would
      // render as Python attribute access (which parse-py.ts correctly refuses
      // without the getattr(...) idiom), and a ^-prefixed name isn't valid Python
      // syntax at all. Refuse rather than guess at an encoding.
      if (symbol.$refText.includes('.') || symbol.$refText.startsWith('^')) throw new UnsupportedInChild();
      return symbol.$refText;
    }
    case 'RosettaFeatureCall': {
      const receiver = rTight(node['receiver'] as RosettaExpression);
      const feature = node['feature'] as { $refText?: string } | undefined;
      if (!feature?.$refText) throw new UnsupportedInChild();
      return `getattr(${receiver}, ${JSON.stringify(feature.$refText)}, None)`;
    }
    case 'RosettaExistsExpression': {
      const argument = rComparisonFamily(node['argument'] as RosettaExpression, 3, 'left');
      return `${argument} is not None`;
    }
    case 'RosettaAbsentExpression': {
      const argument = rComparisonFamily(node['argument'] as RosettaExpression, 3, 'left');
      return `${argument} is None`;
    }
    case 'ArithmeticOperation': {
      const opKey = node['operator'] as string;
      const op = ARITHMETIC_PY[opKey];
      if (op === undefined) throw new UnsupportedInChild();
      const tier = precedenceTier('ArithmeticOperation', opKey)!;
      const left = r(node['left'] as RosettaExpression, tier, 'left');
      const right = r(node['right'] as RosettaExpression, tier, 'right');
      return `${left} ${op} ${right}`;
    }
    case 'ComparisonOperation': {
      if (node['cardMod']) throw new UnsupportedInChild();
      const opKey = node['operator'] as string;
      const op = COMPARISON_PY[opKey];
      if (op === undefined) throw new UnsupportedInChild();
      const tier = precedenceTier('ComparisonOperation', opKey)!;
      const left = rComparisonFamily(node['left'] as RosettaExpression, tier, 'left');
      const right = rComparisonFamily(node['right'] as RosettaExpression, tier, 'right');
      return `${left} ${op} ${right}`;
    }
    case 'EqualityOperation': {
      if (node['cardMod']) throw new UnsupportedInChild();
      const opKey = node['operator'] as string;
      const op = EQUALITY_PY[opKey];
      if (op === undefined) throw new UnsupportedInChild();
      const tier = precedenceTier('EqualityOperation', opKey)!;
      const left = rComparisonFamily(node['left'] as RosettaExpression, tier, 'left');
      const right = rComparisonFamily(node['right'] as RosettaExpression, tier, 'right');
      return `${left} ${op} ${right}`;
    }
    case 'LogicalOperation': {
      const opKey = node['operator'] as string;
      const op = LOGICAL_PY[opKey];
      if (op === undefined) throw new UnsupportedInChild();
      const tier = precedenceTier('LogicalOperation', opKey)!;
      const left = r(node['left'] as RosettaExpression, tier, 'left');
      const right = r(node['right'] as RosettaExpression, tier, 'right');
      return `${left} ${op} ${right}`;
    }
    default:
      throw new UnsupportedInChild();
  }
}
