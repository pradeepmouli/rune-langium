// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * constraint-translator — `ConstraintIR` → Rune `Condition` AST node.
 *
 * The inverse of `../emit/rosetta/render-expression.ts`'s dispatch: instead
 * of walking a `RosettaExpression` tree to text, this builds a
 * `RosettaExpression`-shaped plain object tree (the same dehydrated-node
 * shape `renderNode`/`renderExpression` already consume) from a
 * `ConstraintIR` value. The condition names this module produces are
 * de-duplicated and fed straight into `renderNode` — every condition this
 * module emits is verified (constraint-translator.test.ts) to reparse with
 * zero errors via `@rune-langium/core`'s `parse()`.
 *
 * Grounded against the real grammar + renderer (not invented):
 *  - `Condition.expression` is NOT optional (rune-dsl.langium) — every
 *    branch below, including the untranslatable-stub ones, must produce a
 *    real (if trivial) expression tree, never an empty string.
 *  - `RosettaIntLiteral.value` is a `BigInt`, `RosettaNumberLiteral.value`
 *    is a `string` (see render-expression.test.ts fixtures).
 *  - `RosettaSymbolReference` always carries `explicitArguments`/`rawArgs`
 *    (read unconditionally by render-expression.ts's dispatch).
 *  - The spec's `oneOf`/`choice` IR kinds do NOT map to the grammar's
 *    `OneOfOperation` (a unary postfix operator, `argument one-of` — "exactly
 *    one child of a collection", not "exactly one of N sibling attributes").
 *    The correct construct is `ChoiceOperation` with `necessity: 'required'`
 *    (spec's `oneOf`: exactly one present) or `'optional'` (spec's `choice`:
 *    at most one present) — confirmed against the grammar's `Necessity` rule
 *    and CDM/Rosetta domain usage, and against render-expression.test.ts's
 *    `ChoiceOperation` fixtures.
 *  - `pattern` and `custom` always emit the amended stub form (spec.md open
 *    question 3): a `True` literal expression body plus the TODO text
 *    carried in `Condition.definition` (a `<"...">` doc string, grammar
 *    `RosettaDefinable`) — chosen over a bare comment because the grammar has
 *    no comment-bearing node in the expression slot, and `definition` is a
 *    real, independently-rendered field on `Condition` for exactly this
 *    purpose.
 */

import { escapeId } from '../emit/rosetta/render-expression.js';
import type { ConstraintIR } from './source-model.js';
import { pushDiagnostic, type ImportDiagnostic } from './diagnostics.js';

/** A `RosettaExpression`-shaped plain object (see render-expression.ts's `DehydratedExpression`). */
export type ExpressionNode = Record<string, unknown> & { $type: string };

/** A `Condition`-shaped plain object (see rosetta-render-core.ts's `renderNode` dispatch). */
export interface ConditionNode {
  $type: 'Condition';
  name: string;
  postCondition: false;
  definition?: string;
  expression: ExpressionNode;
  annotations: never[];
  references: never[];
}

function symbolRef(path: string): ExpressionNode {
  return {
    $type: 'RosettaSymbolReference',
    symbol: { $refText: escapeId(path) },
    explicitArguments: false,
    rawArgs: []
  };
}

function intLiteral(n: number): ExpressionNode {
  return { $type: 'RosettaIntLiteral', value: BigInt(Math.trunc(n)) };
}

function numberLiteral(n: number): ExpressionNode {
  return { $type: 'RosettaNumberLiteral', value: String(n) };
}

/** Emits an int literal for an integer value, a number literal otherwise — narrower is more idiomatic Rune. */
function numericLiteral(n: number): ExpressionNode {
  return Number.isInteger(n) ? intLiteral(n) : numberLiteral(n);
}

function stringLiteral(s: string): ExpressionNode {
  return { $type: 'RosettaStringLiteral', value: s };
}

function booleanLiteral(v: boolean): ExpressionNode {
  return { $type: 'RosettaBooleanLiteral', value: v };
}

function comparison(op: string, left: ExpressionNode, right: ExpressionNode): ExpressionNode {
  const $type = op === '=' || op === '<>' ? 'EqualityOperation' : 'ComparisonOperation';
  return { $type, operator: op, left, right };
}

function countOf(argument: ExpressionNode): ExpressionNode {
  return { $type: 'RosettaCountOperation', operator: 'count', argument };
}

function existsOf(argument: ExpressionNode): ExpressionNode {
  return { $type: 'RosettaExistsExpression', operator: 'exists', argument, modifier: undefined };
}

function absentOf(argument: ExpressionNode): ExpressionNode {
  return { $type: 'RosettaAbsentExpression', operator: 'absent', argument };
}

function logical(op: 'and' | 'or', left: ExpressionNode, right: ExpressionNode): ExpressionNode {
  return { $type: 'LogicalOperation', operator: op, left, right };
}

function conditionalOf(ifExpr: ExpressionNode, thenExpr: ExpressionNode): ExpressionNode {
  return { $type: 'RosettaConditionalExpression', if: ifExpr, ifthen: thenExpr, full: false, elsethen: undefined };
}

/** `optional|required choice p1, p2, ...` — the grammar's actual multi-attribute-presence construct. */
function choiceOf(necessity: 'required' | 'optional', paths: readonly string[]): ExpressionNode {
  return {
    $type: 'ChoiceOperation',
    operator: 'choice',
    necessity,
    argument: undefined,
    attributes: paths.map((p) => ({ $refText: escapeId(p) }))
  };
}

/** `True` — the stub body for an untranslatable constraint (always reparses; see module doc). */
const STUB_EXPRESSION: ExpressionNode = booleanLiteral(true);

/**
 * A single attribute-name path segment, safe to reference via `[Attribute:ValidID]`
 * (the grammar's `ChoiceOperation.attributes` / a bare `RosettaSymbolReference`).
 * Multi-segment (`a.b`) or otherwise non-identifier paths are NOT representable
 * by `oneOf`/`choice` — callers must reject those to the `custom` stub before
 * they reach this translator (see source-model.ts's `ConstraintIR` doc).
 */
const SIMPLE_PATH = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isSimplePath(path: string): boolean {
  return SIMPLE_PATH.test(path);
}

/**
 * Deterministic condition-name generator: `<AttributeName><ConstraintKind>`,
 * de-duplicated with numeric suffixes (spec.md "Condition names are generated
 * deterministically"). `used` is mutated (records the returned name) so
 * repeated calls across one type's constraint list dedupe against each other.
 */
export function nextConditionName(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

/** Capitalizes the first character (for `<AttributeName><Kind>` condition-name assembly). */
function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

const KIND_LABEL: Record<ConstraintIR['kind'], string> = {
  comparison: 'Check',
  range: 'Range',
  length: 'Length',
  pattern: 'Pattern',
  oneOf: 'OneOf',
  choice: 'Choice',
  exists: 'Exists',
  absent: 'Absent',
  conditional: 'Conditional',
  custom: 'Custom'
};

/** `<AttributeName><ConstraintKind>` base name before dedup (spec.md's condition-naming rule). */
export function conditionBaseName(ir: ConstraintIR): string {
  const label = KIND_LABEL[ir.kind];
  switch (ir.kind) {
    case 'comparison':
    case 'range':
    case 'length':
    case 'pattern':
    case 'exists':
    case 'absent':
      return `${capitalize(ir.path)}${label}`;
    case 'oneOf':
    case 'choice':
      return label;
    case 'conditional':
      return `${conditionBaseName(ir.then)}Conditional`;
    case 'custom':
      return label;
  }
}

function rangeExpression(ir: Extract<ConstraintIR, { kind: 'range' }>): ExpressionNode {
  const path = symbolRef(ir.path);
  const clauses: ExpressionNode[] = [];
  if (ir.min !== undefined) {
    clauses.push(comparison(ir.exclusive ? '>' : '>=', path, numericLiteral(ir.min)));
  }
  if (ir.max !== undefined) {
    clauses.push(comparison(ir.exclusive ? '<' : '<=', symbolRef(ir.path), numericLiteral(ir.max)));
  }
  if (clauses.length === 0) return STUB_EXPRESSION;
  return clauses.reduce((acc, c) => (acc ? logical('and', acc, c) : c));
}

function lengthExpression(ir: Extract<ConstraintIR, { kind: 'length' }>): ExpressionNode {
  const clauses: ExpressionNode[] = [];
  if (ir.min !== undefined) clauses.push(comparison('>=', countOf(symbolRef(ir.path)), numericLiteral(ir.min)));
  if (ir.max !== undefined) clauses.push(comparison('<=', countOf(symbolRef(ir.path)), numericLiteral(ir.max)));
  if (clauses.length === 0) return STUB_EXPRESSION;
  return clauses.reduce((acc, c) => (acc ? logical('and', acc, c) : c));
}

function comparisonExpression(ir: Extract<ConstraintIR, { kind: 'comparison' }>): ExpressionNode {
  const rhs =
    typeof ir.value === 'string'
      ? stringLiteral(ir.value)
      : typeof ir.value === 'boolean'
        ? booleanLiteral(ir.value)
        : numericLiteral(ir.value);
  return comparison(ir.op, symbolRef(ir.path), rhs);
}

/**
 * Translate one `ConstraintIR` into an expression tree. `conditional`
 * recurses; `oneOf`/`choice` validate every path is a simple identifier
 * (see `isSimplePath`) and fall back to the `custom` stub (with a
 * diagnostic) otherwise — a multi-segment path is not representable by
 * `ChoiceOperation.attributes` (`[Attribute:ValidID]` references).
 */
export function translateConstraintExpression(ir: ConstraintIR, diagnostics: ImportDiagnostic[]): ExpressionNode {
  switch (ir.kind) {
    case 'comparison':
      return comparisonExpression(ir);
    case 'range':
      return rangeExpression(ir);
    case 'length':
      return lengthExpression(ir);
    case 'exists':
      return existsOf(symbolRef(ir.path));
    case 'absent':
      return absentOf(symbolRef(ir.path));
    case 'oneOf':
    case 'choice': {
      const necessity = ir.kind === 'oneOf' ? 'required' : 'optional';
      if (ir.paths.length > 0 && ir.paths.every(isSimplePath)) {
        return choiceOf(necessity, ir.paths);
      }
      pushDiagnostic(diagnostics, {
        severity: 'warning',
        code: 'untranslatable-construct',
        message:
          `${ir.kind} constraint over path(s) [${ir.paths.join(', ')}] is not representable — ` +
          `ChoiceOperation requires simple sibling-attribute names; emitting a stub condition`
      });
      return STUB_EXPRESSION;
    }
    case 'conditional':
      return conditionalOf(
        translateConstraintExpression(ir.if, diagnostics),
        translateConstraintExpression(ir.then, diagnostics)
      );
    case 'pattern':
      pushDiagnostic(diagnostics, {
        severity: 'warning',
        code: 'untranslatable-construct',
        message:
          `pattern constraint on '${ir.path}' (regex: ${ir.regex}) has no Rune expression-level ` +
          `equivalent — emitting a stub condition; manual translation required`
      });
      return STUB_EXPRESSION;
    case 'custom':
      pushDiagnostic(diagnostics, {
        severity: 'warning',
        code: 'untranslatable-construct',
        message:
          `untranslatable source construct: ${ir.expressionText} — emitting a stub condition; ` +
          `manual translation required`
      });
      return STUB_EXPRESSION;
  }
}

/** The stub `definition` doc-string text for pattern/custom (spec.md's amended TODO format). */
function stubDefinition(ir: ConstraintIR): string | undefined {
  if (ir.kind === 'pattern') return `TODO: manual translation required — source pattern: ${ir.regex}`;
  if (ir.kind === 'custom') return `TODO: manual translation required — source: ${ir.expressionText}`;
  return undefined;
}

/**
 * Translate one `ConstraintIR` into a full `Condition` AST node, with a
 * deterministically-generated, de-duplicated name.
 */
export function translateConstraint(
  ir: ConstraintIR,
  used: Set<string>,
  diagnostics: ImportDiagnostic[]
): ConditionNode {
  const name = nextConditionName(conditionBaseName(ir), used);
  const expression = translateConstraintExpression(ir, diagnostics);
  const definition = stubDefinition(ir);
  return {
    $type: 'Condition',
    name,
    postCondition: false,
    ...(definition !== undefined && { definition }),
    expression,
    annotations: [],
    references: []
  };
}
