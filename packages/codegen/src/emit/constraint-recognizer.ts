// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * constraint-recognizer — `Condition.expression` → `ConstraintIR` (the
 * inverse of `../import/constraint-translator.ts`), plus `ConstraintIR` →
 * JSON Schema keyword rendering.
 *
 * Per spec.md Phase 2b Implementation Addendum decision 1: "NEW module:
 * condition-expression → ConstraintIR RECOGNIZER ... + ConstraintIR → JSON
 * Schema keyword rendering. ConstraintIR is the shared vocabulary — internal
 * cross-module sharing within the package is fine (subpaths are PUBLIC
 * surface only); house the shared types where both sides can import them
 * without public cross-subpath re-exports."
 *
 * `ConstraintIR` itself stays defined in `../import/source-model.ts` (its
 * original home, per spec.md's Phase 1 "Module Structure" — the inbound
 * side's own public `/import` subpath re-export of the type is untouched).
 * This module imports it via a plain RELATIVE path
 * (`../import/source-model.js`), not the public `@rune-langium/codegen/import`
 * package subpath — the same pattern `../import/constraint-translator.ts`
 * and `../import/ast-builder.ts` already use in reverse (relative-importing
 * from `../emit/rosetta/render-expression.js`), confirming internal
 * `emit/` ↔ `import/` relative imports are an established, sanctioned
 * pattern; only the package.json `exports` map subpaths are the "public
 * surface" the addendum's restriction is about.
 *
 * Recognizes ONLY the shapes `../import/constraint-translator.ts` itself
 * produces (verified via the mini round-trip in
 * test/emit/constraint-recognizer.test.ts: build via
 * `translateConstraintExpression`, recognize back, assert IR-equivalence) —
 * this is deliberately NOT a general Rune-expression-to-constraint miner;
 * an arbitrary hand-written condition of any other shape returns
 * `undefined` (unrecognized), which the T3 emitter treats exactly like
 * today's opaque `x-rune-conditions` metadata path (nothing lost, keywords
 * are additive per the addendum).
 *
 * Input tolerance mirrors `render-expression.ts`'s own rule ("reads only
 * $type, data fields, and $refText on refs — works identically on live
 * parser output and Dehydrated<T> nodes") — this recognizer is called by
 * T3's emitter directly against REAL, resolved `Data.conditions[].expression`
 * Langium AST nodes (not a dehydrated shape), so every read below uses
 * `$refText` (present on both a live cross-reference's `.$refText` mirror
 * field and a dehydrated `{$refText}` object) rather than `.ref`.
 */

import type { ConstraintIR } from '../import/source-model.js';

type AnyNode = Record<string, unknown> & { $type?: string };

const refText = (r: unknown): string | undefined => (r as { $refText?: string } | undefined)?.$refText;

/** Reads a numeric literal (`RosettaIntLiteral` BigInt or `RosettaNumberLiteral` string) back to a plain `number`. */
function readNumericLiteral(node: unknown): number | undefined {
  const n = node as AnyNode | undefined;
  if (!n) return undefined;
  if (n.$type === 'RosettaIntLiteral') {
    const v = n['value'];
    return typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : undefined;
  }
  if (n.$type === 'RosettaNumberLiteral') {
    const v = n['value'];
    return typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : undefined;
  }
  return undefined;
}

function readLiteral(node: unknown): string | number | boolean | undefined {
  const n = node as AnyNode | undefined;
  if (!n) return undefined;
  if (n.$type === 'RosettaBooleanLiteral') return n['value'] as boolean;
  if (n.$type === 'RosettaStringLiteral') return n['value'] as string;
  return readNumericLiteral(n);
}

/** A bare sibling-attribute reference: `RosettaSymbolReference` with no call args. */
function readSymbolPath(node: unknown): string | undefined {
  const n = node as AnyNode | undefined;
  if (!n || n.$type !== 'RosettaSymbolReference') return undefined;
  if (n['explicitArguments']) return undefined; // a call, not a bare attribute ref
  return refText(n['symbol']);
}

/** `<path> count` — `RosettaCountOperation` over a bare symbol reference. */
function readCountPath(node: unknown): string | undefined {
  const n = node as AnyNode | undefined;
  if (!n || n.$type !== 'RosettaCountOperation') return undefined;
  return readSymbolPath(n['argument']);
}

interface Bound {
  min?: number;
  max?: number;
  exclusive?: boolean;
}

/**
 * Recognizes a single comparison clause as either a `range` bound (LHS is a
 * bare attribute path) or a `length` bound (LHS is `path count`) — the two
 * shapes `rangeExpression`/`lengthExpression` (constraint-translator.ts)
 * produce. Returns `undefined` when the clause isn't one of those two
 * recognized comparison shapes.
 */
function readBoundClause(node: unknown): { path: string; countBased: boolean; bound: Bound } | undefined {
  const n = node as AnyNode | undefined;
  if (!n || (n.$type !== 'ComparisonOperation' && n.$type !== 'EqualityOperation')) return undefined;
  const op = n['operator'] as string | undefined;
  const left = n['left'];
  const right = n['right'];
  const rhs = readNumericLiteral(right);
  if (rhs === undefined) return undefined;

  const asRange = readSymbolPath(left);
  const asLength = readCountPath(left);
  if (asRange === undefined && asLength === undefined) return undefined;
  const path = (asRange ?? asLength)!;
  const countBased = asRange === undefined;

  switch (op) {
    case '>=':
      return { path, countBased, bound: { min: rhs } };
    case '>':
      return { path, countBased, bound: { min: rhs, exclusive: true } };
    case '<=':
      return { path, countBased, bound: { max: rhs } };
    case '<':
      return { path, countBased, bound: { max: rhs, exclusive: true } };
    default:
      return undefined;
  }
}

/**
 * Recognizes `rangeExpression`/`lengthExpression`'s two-clause shape:
 * `clause` or `clause and clause` (same `path`, same `countBased`-ness,
 * consistent `exclusive` flag — `rangeExpression`/`lengthExpression` only
 * ever emit a `LogicalOperation{operator:'and'}` of two same-path,
 * same-count-ness clauses, never a mix).
 */
function readRangeOrLength(node: unknown): ConstraintIR | undefined {
  const n = node as AnyNode | undefined;
  if (!n) return undefined;

  if (n.$type === 'LogicalOperation' && n['operator'] === 'and') {
    const left = readBoundClause(n['left']);
    const right = readBoundClause(n['right']);
    if (!left || !right) return undefined;
    if (left.path !== right.path || left.countBased !== right.countBased) return undefined;
    const min = left.bound.min ?? right.bound.min;
    const max = left.bound.max ?? right.bound.max;
    if (min === undefined || max === undefined) return undefined;
    // `rangeExpression` only ever pairs a min-clause with a max-clause (never
    // min+min or max+max), and both share ONE `exclusive` flag when BUILT by
    // the translator. A `range` IR itself carries only a single `exclusive`
    // flag for the whole constraint, so a genuinely MIXED pair (e.g.
    // hand-written `v > 0 and v <= 10`) is not representable as one `range`
    // IR at all — REGRESSION FIX (review finding): compare the two clauses'
    // exclusivity rather than coalescing with `??`. The prior `left.bound.
    // exclusive ?? right.bound.exclusive` silently guessed one clause's flag
    // for both, mistranslating an inclusive `v <= 10` into `exclusiveMaximum:
    // 10` — one emit→import cycle then silently TIGHTENED the model (the
    // source's legal `v = 10` becomes illegal). Reject mismatched pairs to
    // unrecognized (the caller keeps the opaque `x-rune-conditions`
    // metadata — nothing lost, per the addendum's "additive" rule).
    const leftExclusive = left.bound.exclusive ?? false;
    const rightExclusive = right.bound.exclusive ?? false;
    if (leftExclusive !== rightExclusive) return undefined;
    const exclusive = leftExclusive;
    if (left.countBased) {
      return { kind: 'length', path: left.path, min, max };
    }
    return exclusive
      ? { kind: 'range', path: left.path, min, max, exclusive: true }
      : { kind: 'range', path: left.path, min, max };
  }

  const single = readBoundClause(n);
  if (!single) return undefined;
  if (single.countBased) {
    return { kind: 'length', path: single.path, ...single.bound };
  }
  return { kind: 'range', path: single.path, ...single.bound };
}

/** `EqualityOperation` (`=`/`<>`) between a bare symbol path and a literal — `comparisonExpression`'s shape. */
function readComparison(node: unknown): ConstraintIR | undefined {
  const n = node as AnyNode | undefined;
  if (!n || n.$type !== 'EqualityOperation') return undefined;
  const op = n['operator'] as string | undefined;
  if (op !== '=' && op !== '<>') return undefined;
  const path = readSymbolPath(n['left']);
  if (path === undefined) return undefined;
  const value = readLiteral(n['right']);
  if (value === undefined) return undefined;
  return { kind: 'comparison', op, path, value };
}

/** `required|optional choice p1, p2, ...` — `ChoiceOperation`, `choiceOf`'s shape. */
function readChoice(node: unknown): ConstraintIR | undefined {
  const n = node as AnyNode | undefined;
  if (!n || n.$type !== 'ChoiceOperation') return undefined;
  const necessity = n['necessity'] as string | undefined;
  const rawAttrs = (n['attributes'] as unknown[] | undefined) ?? [];
  const paths = rawAttrs.map(refText).filter((p): p is string => p !== undefined);
  if (paths.length === 0 || paths.length !== rawAttrs.length) return undefined;
  if (necessity === 'required') return { kind: 'oneOf', paths };
  if (necessity === 'optional') return { kind: 'choice', paths };
  return undefined;
}

/** `<path> exists` — `RosettaExistsExpression` over a bare symbol reference, `existsOf`'s shape. */
function readExists(node: unknown): ConstraintIR | undefined {
  const n = node as AnyNode | undefined;
  if (!n || n.$type !== 'RosettaExistsExpression') return undefined;
  if (n['modifier']) return undefined; // a modified exists (e.g. `single exists`) isn't `existsOf`'s plain shape
  const path = readSymbolPath(n['argument']);
  return path === undefined ? undefined : { kind: 'exists', path };
}

/** `<path> is absent` — `RosettaAbsentExpression`, `absentOf`'s shape. */
function readAbsent(node: unknown): ConstraintIR | undefined {
  const n = node as AnyNode | undefined;
  if (!n || n.$type !== 'RosettaAbsentExpression') return undefined;
  const path = readSymbolPath(n['argument']);
  return path === undefined ? undefined : { kind: 'absent', path };
}

/**
 * Recognizes a `Condition.expression` tree as a `ConstraintIR`, when it
 * matches one of the shapes `../import/constraint-translator.ts` itself
 * produces (`rangeExpression`/`lengthExpression`/`comparisonExpression`/
 * `choiceOf`/`existsOf`/`absentOf`) — everything else, including the
 * `pattern`/`custom` stub's bare `True` literal and any hand-written
 * expression of a different shape, is UNRECOGNIZED (`undefined`), matching
 * the addendum's "unrecognizable conditions keep the existing opaque
 * x-rune-conditions metadata" fallback.
 *
 * `conditional` (`if ... then ...`) is deliberately not recognized here —
 * it has no JSON Schema keyword representation the emitter can render
 * (a full JSON Schema `if`/`then` composition is a document-level
 * construct, not a per-property keyword set), so it stays opaque too.
 */
export function recognizeCondition(expression: unknown): ConstraintIR | undefined {
  return (
    readRangeOrLength(expression) ??
    readComparison(expression) ??
    readChoice(expression) ??
    readExists(expression) ??
    readAbsent(expression)
  );
}

/**
 * JSON Schema keywords for a single-property `ConstraintIR` — the shapes a
 * property-level schema object can carry (`minimum`/`maximum`/
 * `exclusiveMinimum`/`exclusiveMaximum` for `range`; `minLength`/`maxLength`
 * for `length`). Type-level constructs (`oneOf`/`choice` — a multi-attribute
 * presence condition, not a single property's own keyword set) and every
 * other kind return `undefined`; the emitter (T3) handles `oneOf`/`choice`
 * separately as a schema-level `required`-group rendering, matching how
 * `json-schema-emitter.ts` already treats "required" as attribute-level
 * (this recognizer's job stops at "is this representable as keywords on
 * ONE property's own schema object").
 */
export function constraintIRToJsonSchemaKeywords(ir: ConstraintIR): Record<string, number> | undefined {
  switch (ir.kind) {
    case 'range': {
      const keywords: Record<string, number> = {};
      if (ir.min !== undefined) keywords[ir.exclusive ? 'exclusiveMinimum' : 'minimum'] = ir.min;
      if (ir.max !== undefined) keywords[ir.exclusive ? 'exclusiveMaximum' : 'maximum'] = ir.max;
      return Object.keys(keywords).length > 0 ? keywords : undefined;
    }
    case 'length': {
      const keywords: Record<string, number> = {};
      if (ir.min !== undefined) keywords['minLength'] = ir.min;
      if (ir.max !== undefined) keywords['maxLength'] = ir.max;
      return Object.keys(keywords).length > 0 ? keywords : undefined;
    }
    default:
      return undefined;
  }
}
