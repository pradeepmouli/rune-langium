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

import type { AstNode } from 'langium';
import { escapeId } from '../emit/rosetta/render-expression.js';
import type { ConstraintIR } from './source-model.js';
import { pushDiagnostic, type ImportDiagnostic } from './diagnostics.js';
import type { Dehydrated } from '@rune-langium/core';
import type {
  RosettaExpression,
  Condition,
  RosettaSymbolReference,
  RosettaIntLiteral,
  RosettaNumberLiteral,
  RosettaStringLiteral,
  RosettaBooleanLiteral,
  ComparisonOperation,
  EqualityOperation,
  RosettaCountOperation,
  RosettaExistsExpression,
  RosettaAbsentExpression,
  LogicalOperation,
  RosettaConditionalExpression,
  ChoiceOperation
} from '@rune-langium/core';

/**
 * `Dehydrated<T>` (core's `serializer/dehydrated.ts`) has two gaps that a
 * naked `Dehydrated<RosettaExpression>` instantiation surfaces — both
 * genuine drift findings from the T1 retrofit (spec.md Phase 2 Addendum: "any
 * type error the swap surfaces is a drift finding, not friction"), reported
 * here rather than silently reshaped:
 *
 *  1. **Non-distributive over a union type parameter.** `Dehydrated<T
 *     extends AstNode>`'s mapped-type body reads `keyof T` — applying it
 *     directly to a union (e.g. `RosettaExpression`, 48 members) does not
 *     distribute member-wise (`Dehydrated<X> | Dehydrated<Y>`); it collapses
 *     to the fields common to EVERY member (`$type`/`$namespace`/
 *     `$cstRange` only), silently dropping every field the branches don't
 *     share (`left`, `right`, `value`, `operator`, ...). This is not
 *     hypothetical: `render-expression.ts`'s own `DehydratedExpression =
 *     Dehydrated<RosettaExpression> | RosettaExpression` has the identical
 *     collapse — it happens to work there only because `renderExpression`
 *     immediately casts to an internal `AnyNode` shape and never relies on
 *     the collapsed type's fields.
 *  2. **`Array<Reference<X>>` fields are not dehydrated at all.**
 *     `DehydratedField<F>`'s reference-shape branch only matches a BARE
 *     `Reference<X>`; its array branch only matches `Array<AstNode>`. A
 *     field typed `Array<Reference<X>>` (e.g. `ChoiceOperation.attributes`,
 *     and 7 other fields across the grammar — `sources` on every synonym
 *     node, `corpusList`, `eligibilityRules`, `superSources`) matches
 *     neither and falls through to `F` unchanged, i.e. stays
 *     `Array<Reference<X>>` (a REAL resolved reference, not `{$refText}`) —
 *     even though every other reference-shaped field on the same node IS
 *     correctly dehydrated to `{$refText}`.
 *
 * `RosettaExpr` below is a local, minimal fix for both gaps, scoped to
 * exactly the `RosettaExpression` members this module actually builds (not
 * a general-purpose replacement for `Dehydrated<T>`).
 */
type DistributedDehydrated<T extends AstNode> = T extends AstNode ? Dehydrated<T> : never;

/** `Dehydrated<ChoiceOperation>` with `attributes` corrected to `{$refText}[]` (see the module doc's gap 2) and its nested `argument`/nothing-else operand replaced by `RosettaExpr` (gap 1 — irrelevant here since `ChoiceOperation` never nests a translated argument, but kept for shape symmetry with its `Dehydrated<T>` sibling). */
type DehydratedChoiceOperation = Omit<Dehydrated<ChoiceOperation>, 'attributes' | 'argument'> & {
  attributes: Array<{ $refText: string }>;
  argument?: RosettaExpr;
};
type DehydratedComparison = Omit<Dehydrated<ComparisonOperation>, 'left' | 'right'> & {
  left?: RosettaExpr;
  right: RosettaExpr;
};
type DehydratedEquality = Omit<Dehydrated<EqualityOperation>, 'left' | 'right'> & {
  left?: RosettaExpr;
  right: RosettaExpr;
};
type DehydratedCount = Omit<Dehydrated<RosettaCountOperation>, 'argument'> & { argument?: RosettaExpr };
type DehydratedExists = Omit<Dehydrated<RosettaExistsExpression>, 'argument'> & { argument?: RosettaExpr };
type DehydratedAbsent = Omit<Dehydrated<RosettaAbsentExpression>, 'argument'> & { argument?: RosettaExpr };
type DehydratedLogical = Omit<Dehydrated<LogicalOperation>, 'left' | 'right'> & {
  left: RosettaExpr;
  right: RosettaExpr;
};
type DehydratedConditional = Omit<Dehydrated<RosettaConditionalExpression>, 'if' | 'ifthen'> & {
  if?: RosettaExpr;
  ifthen?: RosettaExpr;
};

/**
 * The corrected, distributed `RosettaExpression` dehydrated union — see the
 * two-gap doc above. Every branch this module actually constructs is
 * substituted with its `Dehydrated*` correction; branches this module never
 * builds (the other ~35 `RosettaExpression` members) keep the plain
 * (uncorrected, but also unused) `Dehydrated<T>` shape from
 * `DistributedDehydrated`.
 */
type RosettaExpr =
  | Exclude<
      DistributedDehydrated<RosettaExpression>,
      | Dehydrated<ChoiceOperation>
      | Dehydrated<ComparisonOperation>
      | Dehydrated<EqualityOperation>
      | Dehydrated<RosettaCountOperation>
      | Dehydrated<RosettaExistsExpression>
      | Dehydrated<RosettaAbsentExpression>
      | Dehydrated<LogicalOperation>
      | Dehydrated<RosettaConditionalExpression>
    >
  | DehydratedChoiceOperation
  | DehydratedComparison
  | DehydratedEquality
  | DehydratedCount
  | DehydratedExists
  | DehydratedAbsent
  | DehydratedLogical
  | DehydratedConditional;

/** A `RosettaExpression`-shaped plain object — the core-generated `Dehydrated<T>` substrate (corrected; see the module doc above), per spec.md's Phase 2 addendum (BINDING: no invented node types). */
export type ExpressionNode = RosettaExpr;

/**
 * A `Condition`-shaped plain object — `Dehydrated<Condition>`, with two
 * fields corrected:
 *  - `expression` → `RosettaExpr` (gap 1 again: `Condition.expression:
 *    RosettaExpression` is required, and `Dehydrated<Condition>`'s own
 *    mapping resolves it through the uncorrected, collapsed
 *    `Dehydrated<RosettaExpression>`).
 *  - `name` → `string | undefined` (a THIRD `Dehydrated<T>` gap found while
 *    wiring this type: `Condition.name?: ValidID`, and `ValidID = 'condition'
 *    | 'pattern' | ... | string` is itself a union of literal-string members
 *    plus a bare `string`. Passed through `DehydratedField<F>` as a naked
 *    conditional-type parameter, this union distributes internally the same
 *    way gap 1 describes for `RosettaExpression` — empirically verified
 *    (`Dehydrated<Condition>['name']` resolves to `string | Dehydrated<
 *    never> | undefined`, not `string | undefined`) — so ANY optional field
 *    whose type is itself a union (not just a union of `AstNode`s) can hit
 *    this, not only `RosettaExpression`-shaped fields.
 */
export type ConditionNode = Omit<Dehydrated<Condition>, 'expression' | 'name'> & {
  expression: RosettaExpr;
  name: string | undefined;
};

function symbolRef(path: string): Dehydrated<RosettaSymbolReference> {
  return {
    $type: 'RosettaSymbolReference',
    symbol: { $refText: escapeId(path) },
    explicitArguments: false,
    rawArgs: []
  };
}

function intLiteral(n: number): Dehydrated<RosettaIntLiteral> {
  return { $type: 'RosettaIntLiteral', value: BigInt(Math.trunc(n)) };
}

function numberLiteral(n: number): Dehydrated<RosettaNumberLiteral> {
  return { $type: 'RosettaNumberLiteral', value: String(n) };
}

/** Emits an int literal for an integer value, a number literal otherwise — narrower is more idiomatic Rune. */
function numericLiteral(n: number): Dehydrated<RosettaIntLiteral> | Dehydrated<RosettaNumberLiteral> {
  return Number.isInteger(n) ? intLiteral(n) : numberLiteral(n);
}

function stringLiteral(s: string): Dehydrated<RosettaStringLiteral> {
  return { $type: 'RosettaStringLiteral', value: s };
}

function booleanLiteral(v: boolean): Dehydrated<RosettaBooleanLiteral> {
  return { $type: 'RosettaBooleanLiteral', value: v };
}

function comparison(
  op: string,
  left: ExpressionNode,
  right: ExpressionNode
): DehydratedComparison | DehydratedEquality {
  if (op === '=' || op === '<>') {
    return { $type: 'EqualityOperation', operator: op, left, right, cardMod: undefined };
  }
  return {
    $type: 'ComparisonOperation',
    operator: op as '<' | '<=' | '>' | '>=',
    left,
    right,
    cardMod: undefined
  };
}

function countOf(argument: ExpressionNode): DehydratedCount {
  return { $type: 'RosettaCountOperation', operator: 'count', argument };
}

function existsOf(argument: ExpressionNode): DehydratedExists {
  return { $type: 'RosettaExistsExpression', operator: 'exists', argument, modifier: undefined };
}

function absentOf(argument: ExpressionNode): DehydratedAbsent {
  return { $type: 'RosettaAbsentExpression', operator: 'absent', argument };
}

function logical(op: 'and' | 'or', left: ExpressionNode, right: ExpressionNode): DehydratedLogical {
  return { $type: 'LogicalOperation', operator: op, left, right };
}

function conditionalOf(ifExpr: ExpressionNode, thenExpr: ExpressionNode): DehydratedConditional {
  return { $type: 'RosettaConditionalExpression', if: ifExpr, ifthen: thenExpr, full: false, elsethen: undefined };
}

/**
 * `optional|required choice p1, p2, ...` — the grammar's actual
 * multi-attribute-presence construct.
 *
 * DRIFT FINDING (T1): `ChoiceOperation.attributes` is `Array<Reference<
 * Attribute>>` in the real grammar — an ARRAY OF references, not a
 * reference or an array of `AstNode`s. `Dehydrated<T>`'s field mapper
 * (`DehydratedField<F>`) only dehydrates a bare `Reference` (via the
 * `ReferenceShape` branch) or an `Array<AstNode>` (via the array branch);
 * `Array<Reference<X>>` matches neither, so it falls through to plain `F`
 * unchanged — meaning `Dehydrated<ChoiceOperation>['attributes']` stays
 * `Array<Reference<Attribute>>` (requiring a real, resolved `.ref`), not the
 * `{ $refText: string }[]` shape every real fixture (and the renderer's own
 * dispatch) actually uses. Typed locally to the correct dehydrated shape
 * rather than silently reshaping the emitted value — the runtime object is
 * unchanged from pre-retrofit code.
 */
function choiceOf(necessity: 'required' | 'optional', paths: readonly string[]): DehydratedChoiceOperation {
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
    // DRIFT FINDING (T1): `Dehydrated<T>` makes every field (including ones
    // optional on the original AST interface, like `Condition.definition`)
    // a REQUIRED key of type `V | undefined` rather than an optional key —
    // `DehydratedField<F>` maps the field's own type, but the enclosing
    // mapped type never adds a `?` modifier. A conditional spread (the
    // pre-retrofit idiom, which OMITS the key when undefined) no longer
    // satisfies the type; every key must be present explicitly.
    definition,
    expression,
    annotations: [],
    references: []
  };
}
