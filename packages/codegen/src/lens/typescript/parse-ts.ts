// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * TypeScript text → `LensResult` (parse-back), via tree-sitter.
 *
 * Walks a deliberately narrow set of tree-sitter node `.type`s. Anything
 * else — assignments, calls, unguarded `member_expression` (no `?.`), any
 * statement other than a single `expression_statement` — is a refusal,
 * never a degraded node. Node type names below were confirmed against a
 * real parse of each construct (see Step 8's note) — not assumed from
 * grammar documentation.
 */
import type { Node as TsNode } from 'web-tree-sitter';
import type { RosettaExpression } from '@rune-langium/core';
import type { LensResult, RefusalReason } from '../language-lens.js';
import { createTsParser, type WasmSource } from './ts-grammar-loader.js';

function refusal(kind: RefusalReason['kind'], message: string, offset: number, length: number): LensResult {
  return { ok: false, reason: { kind, message, offset, length } };
}

/**
 * `wasmSource` is threaded straight through to `createTsParser` — omit it
 * in Node/test contexts (resolves the package's own `.wasm` from disk);
 * pass fetched bytes explicitly in the browser (see Task 6's studio wiring,
 * which fetches the grammar once via a Vite `?url` asset import and caches
 * the resulting `Parser`).
 */
export async function parseTs(text: string, wasmSource?: WasmSource): Promise<LensResult> {
  const parser = await createTsParser(wasmSource);
  const tree = parser.parse(text);
  if (tree === null) {
    return refusal('syntax-error', 'the TypeScript parser returned no tree (empty input?)', 0, text.length);
  }
  const root = tree.rootNode;

  if (root.hasError) {
    const errorNode = root.descendantsOfType('ERROR')[0] ?? root;
    return refusal(
      'syntax-error',
      'syntax error in TypeScript expression',
      errorNode.startIndex,
      errorNode.endIndex - errorNode.startIndex
    );
  }

  if (root.childCount !== 1 || root.child(0)?.type !== 'expression_statement') {
    return refusal('syntax-error', 'expected a single expression', 0, text.length);
  }

  const exprStatement = root.child(0)!;
  const expr = exprStatement.child(0);
  if (!expr) return refusal('syntax-error', 'expected a single expression', 0, text.length);

  try {
    return { ok: true, node: toRosetta(expr) };
  } catch (e) {
    if (e instanceof OutOfSubset) {
      return refusal('out-of-subset', e.message, e.tsNode.startIndex, e.tsNode.endIndex - e.tsNode.startIndex);
    }
    throw e;
  }
}

class OutOfSubset extends Error {
  constructor(
    message: string,
    public readonly tsNode: TsNode
  ) {
    super(message);
  }
}

const COMPARISON_FROM_TS: Record<string, string> = { '<': '<', '<=': '<=', '>': '>', '>=': '>=' };
const EQUALITY_FROM_TS: Record<string, string> = { '===': '=', '!==': '<>' };
const LOGICAL_FROM_TS: Record<string, string> = { '&&': 'and', '||': 'or' };
const ARITHMETIC_FROM_TS: Record<string, string> = { '+': '+', '-': '-', '*': '*', '/': '/' };

function child(node: TsNode, i: number): TsNode {
  const c = node.child(i);
  if (!c) throw new OutOfSubset('malformed expression', node);
  return c;
}

function field(node: TsNode, name: string): TsNode {
  const c = node.childForFieldName(name);
  if (!c) throw new OutOfSubset(`malformed '${node.type}' (missing ${name})`, node);
  return c;
}

function toRosetta(node: TsNode): RosettaExpression {
  switch (node.type) {
    case 'parenthesized_expression':
      // Children are positional — `(`, expression, `)` — not a named field.
      // Confirmed against a real parse of `(a + b) * c` before writing this.
      return toRosetta(child(node, 1));

    case 'binary_expression': {
      const left = field(node, 'left');
      const right = field(node, 'right');
      const op = child(node, 1).text;

      // `x != null` / `x == null` are the presence idiom, not literal
      // equality — Rune has no null literal, so this mapping is
      // unambiguous both ways.
      if ((op === '!==' || op === '!=') && right.type === 'null') {
        return {
          $type: 'RosettaExistsExpression',
          argument: toRosetta(left),
          operator: 'exists'
        } as unknown as RosettaExpression;
      }
      if ((op === '===' || op === '==') && right.type === 'null') {
        return {
          $type: 'RosettaAbsentExpression',
          argument: toRosetta(left),
          operator: 'absent'
        } as unknown as RosettaExpression;
      }

      if (op in COMPARISON_FROM_TS) {
        return {
          $type: 'ComparisonOperation',
          left: toRosetta(left),
          operator: COMPARISON_FROM_TS[op],
          right: toRosetta(right)
        } as unknown as RosettaExpression;
      }
      if (op in EQUALITY_FROM_TS) {
        return {
          $type: 'EqualityOperation',
          left: toRosetta(left),
          operator: EQUALITY_FROM_TS[op],
          right: toRosetta(right)
        } as unknown as RosettaExpression;
      }
      if (op in LOGICAL_FROM_TS) {
        return {
          $type: 'LogicalOperation',
          left: toRosetta(left),
          operator: LOGICAL_FROM_TS[op],
          right: toRosetta(right)
        } as unknown as RosettaExpression;
      }
      if (op in ARITHMETIC_FROM_TS) {
        return {
          $type: 'ArithmeticOperation',
          left: toRosetta(left),
          operator: ARITHMETIC_FROM_TS[op],
          right: toRosetta(right)
        } as unknown as RosettaExpression;
      }
      throw new OutOfSubset(`operator '${op}' is not supported`, node);
    }

    // Only `?.`-guarded access is accepted — plain `.` implies a different
    // (non-propagating) null semantic than Rune's optional path navigation.
    // Distinguishing field, confirmed by parsing both forms: `optional_chain`
    // is a present child node for `?.` and `null` for plain `.`.
    case 'member_expression': {
      if (!node.childForFieldName('optional_chain')) {
        throw new OutOfSubset('property access must use ?. — plain . has no Rune equivalent', node);
      }
      const object = field(node, 'object');
      const property = field(node, 'property');
      return {
        $type: 'RosettaFeatureCall',
        receiver: toRosetta(object),
        feature: { $refText: property.text }
      } as unknown as RosettaExpression;
    }

    case 'identifier':
      return {
        $type: 'RosettaSymbolReference',
        explicitArguments: false,
        rawArgs: [],
        symbol: { $refText: node.text }
      } as unknown as RosettaExpression;

    case 'true':
    case 'false':
      return { $type: 'RosettaBooleanLiteral', value: node.type === 'true' } as unknown as RosettaExpression;

    case 'number': {
      const text = node.text;
      return {
        $type: text.includes('.') ? 'RosettaNumberLiteral' : 'RosettaIntLiteral',
        value: text.includes('.') ? Number(text) : parseInt(text, 10)
      } as unknown as RosettaExpression;
    }

    case 'string': {
      // tree-sitter's `string` node's `.text` includes the surrounding
      // quotes verbatim (e.g. `"USD"`), but `RosettaStringLiteral.value`
      // (per packages/core/src/generated/ast.ts) holds the unquoted
      // content — render-expression.ts re-adds quoting on the way back out.
      // Strip exactly the outer quote pair; no escape-sequence unescaping
      // is done here (out of scope for Phase 1's corpus, which uses only
      // plain ASCII string literals like "USD").
      return { $type: 'RosettaStringLiteral', value: node.text.slice(1, -1) } as unknown as RosettaExpression;
    }

    default:
      throw new OutOfSubset(`'${node.type}' is not supported`, node);
  }
}
