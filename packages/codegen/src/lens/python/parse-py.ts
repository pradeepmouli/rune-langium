// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Python text → `LensResult` (parse-back), via tree-sitter.
 *
 * Mirrors `../typescript/parse-ts.ts`'s structure. Node type/field names
 * below were confirmed against real tree-sitter-python parses during Phase
 * 3 planning and Task 3 Step 1 — not assumed from grammar documentation.
 */
import type { Node as PyNode } from 'web-tree-sitter';
import type { RosettaExpression } from '@rune-langium/core';
import type { LensResult, RefusalReason } from '../language-lens.js';
import { createPyParser, type WasmSource } from './py-grammar-loader.js';
import { isRuneValidId } from '../valid-id.js';

function refusal(kind: RefusalReason['kind'], message: string, offset: number, length: number): LensResult {
  return { ok: false, reason: { kind, message, offset, length } };
}

export async function parsePy(text: string, wasmSource?: WasmSource): Promise<LensResult> {
  const parser = await createPyParser(wasmSource);
  const tree = parser.parse(text);
  if (tree === null) {
    return refusal('syntax-error', 'the Python parser returned no tree (empty input?)', 0, text.length);
  }
  const root = tree.rootNode;

  if (root.hasError) {
    const errorNode = root.descendantsOfType('ERROR')[0] ?? root;
    return refusal(
      'syntax-error',
      'syntax error in Python expression',
      errorNode.startIndex,
      errorNode.endIndex - errorNode.startIndex
    );
  }

  // Python's tree-sitter grammar wraps everything in a `module` node (not
  // the `program` root TS uses) whose single statement must be an
  // `expression_statement` — confirmed via Task 3 Step 1 spike.
  if (root.type !== 'module' || root.childCount !== 1 || root.child(0)?.type !== 'expression_statement') {
    return refusal('syntax-error', 'expected a single expression', 0, text.length);
  }

  const exprStatement = root.child(0)!;
  if (exprStatement.childCount !== 1) {
    return refusal('syntax-error', 'expected a single expression', 0, text.length);
  }
  const expr = exprStatement.child(0);
  if (!expr) return refusal('syntax-error', 'expected a single expression', 0, text.length);

  try {
    return { ok: true, node: toRosetta(expr) };
  } catch (e) {
    if (e instanceof OutOfSubset) {
      return refusal('out-of-subset', e.message, e.pyNode.startIndex, e.pyNode.endIndex - e.pyNode.startIndex);
    }
    throw e;
  }
}

class OutOfSubset extends Error {
  constructor(
    message: string,
    public readonly pyNode: PyNode
  ) {
    super(message);
  }
}

const COMPARISON_FROM_PY: Record<string, string> = { '<': '<', '<=': '<=', '>': '>', '>=': '>=' };
const EQUALITY_FROM_PY: Record<string, string> = { '==': '=', '!=': '<>' };
const LOGICAL_FROM_PY: Record<string, string> = { and: 'and', or: 'or' };
const ARITHMETIC_FROM_PY: Record<string, string> = { '+': '+', '-': '-', '*': '*', '/': '/' };

function child(node: PyNode, i: number): PyNode {
  const c = node.child(i);
  if (!c) throw new OutOfSubset('malformed expression', node);
  return c;
}

function field(node: PyNode, name: string): PyNode {
  const c = node.childForFieldName(name);
  if (!c) throw new OutOfSubset(`malformed '${node.type}' (missing ${name})`, node);
  return c;
}

/**
 * Shared by `case 'integer'/'float':` and the unary negative-literal case —
 * mirrors parse-ts.ts's numberNodeToRosetta exactly, including the Rune
 * BigDecimal grammar constraint. Python's own complex-number `j`/`J`
 * suffix folds into the same refused-character-class check (confirmed via
 * Task 3 Step 1 spike: `1j` parses as a plain `integer` node, no distinct
 * complex node type — the suffix is baked into the token text).
 */
function numberNodeToRosetta(text: string, node: PyNode): RosettaExpression {
  if (/[xXoObBjJ_]/.test(text)) {
    throw new OutOfSubset(
      `number literal '${text}' is not supported (hex/octal/binary/complex/separator forms have no Rune equivalent)`,
      node
    );
  }
  // Same Rune BigDecimal-grammar constraint as parse-ts.ts: a bare
  // integer with an exponent and no decimal point (e.g. `1e5`) is not
  // valid Rune BigDecimal syntax. Confirmed via Task 3 Step 1 spike that
  // Python's `float` grammar accepts this bare form too (`1e5` parses as
  // a `float` node). Refused, not normalized, for the same round-trip
  // fidelity reason parse-ts.ts documents.
  if (/[eE]/.test(text) && !text.includes('.')) {
    throw new OutOfSubset(
      `number literal '${text}' is not supported (Rune's BigDecimal grammar requires a decimal point before an exponent — use e.g. '1.0e5' instead of '1e5')`,
      node
    );
  }
  if (/[.eE]/.test(text)) {
    return { $type: 'RosettaNumberLiteral', value: text } as unknown as RosettaExpression;
  }
  return { $type: 'RosettaIntLiteral', value: BigInt(text) } as unknown as RosettaExpression;
}

/**
 * Decode a Python `string` node the same double-quote-only + `JSON.parse`
 * way parse-ts.ts decodes TS `string` nodes.
 *
 * Task 3 Step 1 spike confirmed Python's tree-sitter grammar wraps a string
 * as `string(string_start, string_content, string_end)` with those three
 * children POSITIONAL, not named fields — `node.childForFieldName('string_content')`
 * returns `undefined`. However no field/positional extraction is actually
 * needed for decoding: the `string` node's own `.text` spans the whole
 * literal INCLUDING the quotes (e.g. `"USD"` parses to a `string` node
 * whose `.text` is exactly `"USD"`, and an empty `""` string's `.text` is
 * `""` even though it has no `string_content` child at all — confirmed via
 * spike), so `node.text` behaves identically to TS's flat `string` node for
 * this purpose and the same `JSON.parse` decode applies unchanged.
 */
function stringNodeToRosetta(node: PyNode): RosettaExpression {
  if (!node.text.startsWith('"')) {
    throw new OutOfSubset('string literals must be double-quoted', node);
  }
  let value: string;
  try {
    value = JSON.parse(node.text) as string;
  } catch {
    throw new OutOfSubset(`string literal '${node.text}' could not be decoded`, node);
  }
  return { $type: 'RosettaStringLiteral', value } as unknown as RosettaExpression;
}

function toRosetta(node: PyNode): RosettaExpression {
  switch (node.type) {
    case 'parenthesized_expression':
      // Children are positional — `(`, expression, `)` — not a named
      // field. Same shape as TS's parenthesized_expression (mirrors
      // parse-ts.ts's identical case); confirmed against a real parse of
      // `(a + b) * c` before writing this — see py-grammar-loader spike
      // notes. Without this case, any parenthesized subexpression
      // rendered by render-py.ts (e.g. `(a + b) * c`) falls through to
      // `default:` and refuses with 'out-of-subset', which is wrong: a
      // parenthesized expression the renderer itself emitted must always
      // parse back.
      return toRosetta(child(node, 1));

    case 'boolean_operator': {
      const left = field(node, 'left');
      const right = field(node, 'right');
      const op = field(node, 'operator').text;
      if (op in LOGICAL_FROM_PY) {
        return {
          $type: 'LogicalOperation',
          left: toRosetta(left),
          operator: LOGICAL_FROM_PY[op],
          right: toRosetta(right)
        } as unknown as RosettaExpression;
      }
      throw new OutOfSubset(`operator '${op}' is not supported`, node);
    }

    case 'comparison_operator': {
      // Operands are positional, not named fields (confirmed via Task 3
      // Step 1 spike). A chained comparison (`a < b < c`) produces
      // childCount 5 (3 operands, 2 operators) — no Rune equivalent,
      // refuse outright.
      if (node.childCount !== 3) {
        throw new OutOfSubset('chained comparisons are not supported', node);
      }
      const left = child(node, 0);
      const right = child(node, 2);
      const op = child(node, 1).text;

      // `x is not None` / `x is None` are the presence idiom — confirmed
      // via Task 3 Step 1 spike that `is not` is a SINGLE token (not two
      // children), so a direct text comparison is sufficient.
      if (op === 'is not' && right.type === 'none') {
        return {
          $type: 'RosettaExistsExpression',
          argument: toRosetta(left),
          operator: 'exists'
        } as unknown as RosettaExpression;
      }
      if (op === 'is' && right.type === 'none') {
        return {
          $type: 'RosettaAbsentExpression',
          argument: toRosetta(left),
          operator: 'absent'
        } as unknown as RosettaExpression;
      }

      if (op in COMPARISON_FROM_PY) {
        return {
          $type: 'ComparisonOperation',
          left: toRosetta(left),
          operator: COMPARISON_FROM_PY[op],
          right: toRosetta(right)
        } as unknown as RosettaExpression;
      }
      if (op in EQUALITY_FROM_PY) {
        return {
          $type: 'EqualityOperation',
          left: toRosetta(left),
          operator: EQUALITY_FROM_PY[op],
          right: toRosetta(right)
        } as unknown as RosettaExpression;
      }
      throw new OutOfSubset(`operator '${op}' is not supported`, node);
    }

    case 'binary_operator': {
      const left = field(node, 'left');
      const right = field(node, 'right');
      const op = field(node, 'operator').text;
      if (op in ARITHMETIC_FROM_PY) {
        return {
          $type: 'ArithmeticOperation',
          left: toRosetta(left),
          operator: ARITHMETIC_FROM_PY[op],
          right: toRosetta(right)
        } as unknown as RosettaExpression;
      }
      // '**' and '//' fall through here with no Rune equivalent.
      throw new OutOfSubset(`operator '${op}' is not supported`, node);
    }

    // tree-sitter always parses a leading `-` before a numeric literal as a
    // `unary_operator` wrapping an `integer`/`float` node — same shape as
    // TS's `unary_expression` (confirmed via Task 3 Step 1 spike, same
    // field names: `operator`, `argument`). Every other unary shape
    // (negating an identifier/call/attribute, unary `+`, etc.) has no
    // Rune equivalent.
    case 'unary_operator': {
      const operator = field(node, 'operator');
      const argument = field(node, 'argument');
      // Python distinguishes `integer` and `float` as separate node types
      // (unlike TS, where both fold into a single `number` type) — a
      // negative decimal like `-1.5` produces `argument.type === 'float'`,
      // confirmed via a direct parse. render-py.ts's numeric case emits
      // this exact text for a negative RosettaNumberLiteral, so both
      // literal node types must be accepted here or negative decimals
      // silently fail to round-trip.
      if (operator.text !== '-' || (argument.type !== 'integer' && argument.type !== 'float')) {
        throw new OutOfSubset(
          "'unary_operator' is not supported (only negative numeric literals have a Rune equivalent)",
          node
        );
      }
      return numberNodeToRosetta('-' + argument.text, node);
    }

    // No Rune equivalent (Global Constraint 2) — Rune has no unary "not" $type.
    case 'not_operator':
      throw new OutOfSubset("'not' is not supported (Rune has no unary boolean-negation equivalent)", node);

    // Plain '.' access has no propagation semantics — only the getattr(...)
    // call form below is accepted (Global Constraint 3).
    case 'attribute':
      throw new OutOfSubset(
        'attribute access must use getattr(x, "field", None) — plain . has no Rune equivalent',
        node
      );

    // Only the 3-arg getattr(receiver, "field", None) form is accepted, as
    // the Python projection of RosettaFeatureCall's optional propagation
    // (Global Constraint 3). The 2-arg form (no default) raises
    // AttributeError instead of propagating None — not equivalent, refused.
    case 'call': {
      const fn = field(node, 'function');
      const args = field(node, 'arguments');
      if (fn.type !== 'identifier' || fn.text !== 'getattr' || args.namedChildCount !== 3) {
        throw new OutOfSubset('only getattr(x, "field", None) calls are supported', node);
      }
      const receiverNode = args.namedChild(0)!;
      const fieldNode = args.namedChild(1)!;
      const defaultNode = args.namedChild(2)!;
      if (fieldNode.type !== 'string' || defaultNode.type !== 'none') {
        throw new OutOfSubset('only getattr(x, "field", None) calls are supported', node);
      }
      const featureLiteral = stringNodeToRosetta(fieldNode) as unknown as { value: string };
      if (!isRuneValidId(featureLiteral.value)) {
        throw new OutOfSubset(
          `"${featureLiteral.value}" is not a valid Rune identifier for a feature reference`,
          fieldNode
        );
      }
      return {
        $type: 'RosettaFeatureCall',
        receiver: toRosetta(receiverNode),
        feature: { $refText: featureLiteral.value }
      } as unknown as RosettaExpression;
    }

    case 'identifier':
      return {
        $type: 'RosettaSymbolReference',
        explicitArguments: false,
        rawArgs: [],
        symbol: { $refText: node.text }
      } as unknown as RosettaExpression;

    // Confirmed via Task 3 Step 1 spike: Python's tree-sitter grammar uses
    // the SAME lowercase `true`/`false` node type strings TS uses.
    case 'true':
    case 'false':
      return { $type: 'RosettaBooleanLiteral', value: node.type === 'true' } as unknown as RosettaExpression;

    case 'integer':
    case 'float':
      return numberNodeToRosetta(node.text, node);

    case 'string':
      return stringNodeToRosetta(node);

    // `none` never appears as a standalone case — it's only ever consulted
    // as a child of `comparison_operator` (the `is`/`is not` idiom) or as
    // the 3rd argument of a `getattr` call. A bare `None` literal on its
    // own falls through to `default:` and refuses, matching TS's parser
    // having no bare-`null`-literal case either.

    default:
      throw new OutOfSubset(`'${node.type}' is not supported`, node);
  }
}
