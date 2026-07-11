// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Rune → TypeScript projection over subset `S` (see ../subset.ts).
 *
 * Independent of `expr/transpiler.ts` on purpose: that module's per-category
 * functions all require an `ExpressionTranspilerContext` (selfName, emitMode,
 * conditionName) built for emitting Zod-validator predicates inside a
 * generated class — this projects a bare expression tree with no host
 * condition at all. See the plan's "Deviations From the Spec" note.
 *
 * Returns `null` for any node outside `S` — never an approximate rendering.
 */
import type { RosettaExpression } from '@rune-langium/core';
import { isInSubsetS } from '../subset.js';

type AnyNode = RosettaExpression & Record<string, unknown>;

const COMPARISON_TS: Record<string, string> = { '<': '<', '<=': '<=', '>': '>', '>=': '>=' };
const EQUALITY_TS: Record<string, string> = { '=': '===', '<>': '!==' };
const LOGICAL_TS: Record<string, string> = { and: '&&', or: '||' };
const ARITHMETIC_TS: Record<string, string> = { '+': '+', '-': '-', '*': '*', '/': '/' };

/** Render `child`, parenthesizing whenever it is itself a binary/logical node. */
function r(child: RosettaExpression): string {
  const node = child as AnyNode;
  const text = renderTs(child);
  if (text === null) throw new UnsupportedInChild();
  const needsParens =
    node.$type === 'LogicalOperation' ||
    node.$type === 'ComparisonOperation' ||
    node.$type === 'EqualityOperation' ||
    node.$type === 'ArithmeticOperation';
  return needsParens ? `(${text})` : text;
}

/** Internal signal: a child was outside `S` — caught by `renderTs` to return `null`. */
class UnsupportedInChild extends Error {}

export function renderTs(node: RosettaExpression): string | null {
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
      return node['value'] ? 'true' : 'false';
    case 'RosettaIntLiteral':
    case 'RosettaNumberLiteral':
      return String(node['value']);
    case 'RosettaStringLiteral':
      return JSON.stringify(String(node['value']));
    case 'RosettaSymbolReference': {
      const symbol = node['symbol'] as { $refText?: string } | undefined;
      const rawArgs = (node['rawArgs'] as RosettaExpression[] | undefined) ?? [];
      if (rawArgs.length > 0) throw new UnsupportedInChild(); // function calls: out of S for Phase 1
      return symbol?.$refText ?? '';
    }
    case 'RosettaFeatureCall': {
      const receiver = r(node['receiver'] as RosettaExpression);
      const feature = node['feature'] as { $refText?: string } | undefined;
      return `${receiver}?.${feature?.$refText ?? ''}`;
    }
    case 'RosettaExistsExpression': {
      const argument = r(node['argument'] as RosettaExpression);
      return `${argument} != null`;
    }
    case 'RosettaAbsentExpression': {
      const argument = r(node['argument'] as RosettaExpression);
      return `${argument} == null`;
    }
    case 'ArithmeticOperation': {
      const left = r(node['left'] as RosettaExpression);
      const right = r(node['right'] as RosettaExpression);
      const op = ARITHMETIC_TS[node['operator'] as string];
      return `${left} ${op} ${right}`;
    }
    case 'ComparisonOperation': {
      const left = r(node['left'] as RosettaExpression);
      const right = r(node['right'] as RosettaExpression);
      const op = COMPARISON_TS[node['operator'] as string];
      return `${left} ${op} ${right}`;
    }
    case 'EqualityOperation': {
      const left = r(node['left'] as RosettaExpression);
      const right = r(node['right'] as RosettaExpression);
      const op = EQUALITY_TS[node['operator'] as string];
      return `${left} ${op} ${right}`;
    }
    case 'LogicalOperation': {
      const left = r(node['left'] as RosettaExpression);
      const right = r(node['right'] as RosettaExpression);
      const op = LOGICAL_TS[node['operator'] as string];
      return `${left} ${op} ${right}`;
    }
    default:
      throw new UnsupportedInChild();
  }
}
