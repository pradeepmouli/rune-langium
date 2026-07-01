// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * render-expression — structural Rune DSL renderer for `RosettaExpression`
 * trees (B1). Mirrors transpiler.ts's per-$type dispatch but emits DSL text.
 *
 * Input tolerance: reads only `$type`, data fields, and `$refText` on refs —
 * works identically on live parser output and `Dehydrated<T>` nodes.
 *
 * Precedence (grammar-verified; `=`/`<>` and comparisons share ONE tier):
 *   0 conditional (always parenthesized as a child)
 *   1 then · 2 or · 3 and · 4 = <> >= <= > < · 5 + - · 6 * /
 *   7 contains disjoint default join · 8 postfix/atoms
 *
 * Side-aware wrapping: child wraps when prec(child) < minPrec.
 *   binary left minPrec = myPrec; binary right minPrec = myPrec + 1;
 *   postfix argument minPrec = 8.
 * This preserves explicit right-side grouping (`a or (b or c)`), which a
 * single `<` comparison silently drops.
 */

import type { Dehydrated, RosettaExpression } from '@rune-langium/core';
import { escapeString } from './rosetta-render-core.js';

export type DehydratedExpression = Dehydrated<RosettaExpression> | RosettaExpression;

/** Generic verbatim escape-hatch leaf (pre-rendered DSL fragment). */
export const RAW_DSL_TYPE = 'RawDsl';
export interface RawDslLeaf { $type: 'RawDsl'; text: string }

/** Thrown on an unknown `$type` so callers can fall back to CST text. */
export class UnsupportedExpressionError extends Error {
  constructor(public readonly nodeType: string) {
    super(`renderExpression: unsupported expression $type '${nodeType}'`);
  }
}

type AnyNode = Record<string, unknown> & { $type: string };
const refText = (r: unknown): string => ((r as { $refText?: string } | undefined)?.$refText ?? '');

const PREC_CONDITIONAL = 0;
const PREC_POSTFIX = 8;

function prec(node: AnyNode): number {
  switch (node.$type) {
    case 'RosettaConditionalExpression': return PREC_CONDITIONAL;
    case 'ThenOperation': return 1;
    case 'LogicalOperation': return node['operator'] === 'or' ? 2 : 3;
    case 'EqualityOperation':
    case 'ComparisonOperation': return 4;
    case 'ArithmeticOperation': return node['operator'] === '*' || node['operator'] === '/' ? 6 : 5;
    case 'RosettaContainsExpression':
    case 'RosettaDisjointExpression':
    case 'DefaultOperation':
    case 'JoinOperation': return 7;
    default: return PREC_POSTFIX;
  }
}

/** Render `child`, parenthesizing when its precedence is below `minPrec`. */
function r(child: unknown, minPrec: number): string {
  const node = child as AnyNode;
  const text = dispatch(node);
  return prec(node) < minPrec ? `(${text})` : text;
}

/** Render an expression tree to Rune DSL text. */
export function renderExpression(expr: DehydratedExpression): string {
  return dispatch(expr as unknown as AnyNode);
}

function dispatch(node: AnyNode): string {
  const p = prec(node);
  switch (node.$type) {
    // --- escape hatch ---
    case RAW_DSL_TYPE:
      return String(node['text'] ?? '');

    // --- literals ---
    case 'RosettaBooleanLiteral': return node['value'] ? 'True' : 'False';
    case 'RosettaIntLiteral': return String(node['value']);
    case 'RosettaNumberLiteral': return String(node['value']);
    case 'RosettaStringLiteral': return `"${escapeString(String(node['value'] ?? ''))}"`;

    // --- references / atoms ---
    case 'RosettaSymbolReference':
    case 'RosettaSuperCall': {
      const head = node.$type === 'RosettaSuperCall' ? 'super' : refText(node['symbol']);
      const rawArgs = (node['rawArgs'] as unknown[] | undefined) ?? [];
      if (node['explicitArguments']) return `${head}(${rawArgs.map((a) => r(a, 1)).join(', ')})`;
      return head;
    }
    case 'RosettaImplicitVariable': return 'item';
    case 'ListLiteral': {
      const elements = (node['elements'] as unknown[] | undefined) ?? [];
      // Grammar: `empty` and `[...]` both infer ListLiteral; an empty list IS `empty`.
      if (elements.length === 0) return 'empty';
      return `[${elements.map((e) => r(e, 1)).join(', ')}]`;
    }

    // --- binary chains (left minPrec = p, right minPrec = p + 1) ---
    case 'ArithmeticOperation':
    case 'LogicalOperation':
      return `${r(node['left'], p)} ${node['operator']} ${r(node['right'], p + 1)}`;
    case 'EqualityOperation':
    case 'ComparisonOperation': {
      const cardMod = node['cardMod'] ? `${node['cardMod']} ` : '';
      const rhs = `${cardMod}${node['operator']} ${r(node['right'], p + 1)}`;
      return node['left'] ? `${r(node['left'], p)} ${rhs}` : rhs;
    }
    case 'RosettaContainsExpression':
    case 'RosettaDisjointExpression':
    case 'DefaultOperation': {
      const rhs = `${node['operator']} ${r(node['right'], p + 1)}`;
      return node['left'] ? `${r(node['left'], p)} ${rhs}` : rhs;
    }
    case 'JoinOperation': {
      const left = node['left'] ? `${r(node['left'], p)} ` : '';
      const right = node['right'] ? ` ${r(node['right'], p + 1)}` : '';
      return `${left}join${right}`;
    }

    // --- navigation (postfix tier) ---
    case 'RosettaFeatureCall':
      return `${r(node['receiver'], PREC_POSTFIX)} -> ${refText(node['feature'])}`;
    case 'RosettaDeepFeatureCall':
      return `${r(node['receiver'], PREC_POSTFIX)} ->> ${refText(node['feature'])}`;

    default:
      return dispatchExtended(node, p);
  }
}

const SIMPLE_POSTFIX = new Set([
  'RosettaOnlyElement', 'RosettaCountOperation', 'FlattenOperation', 'DistinctOperation',
  'ReverseOperation', 'FirstOperation', 'LastOperation', 'SumOperation', 'OneOfOperation',
  'ToStringOperation', 'ToNumberOperation', 'ToIntOperation', 'ToTimeOperation',
  'ToDateOperation', 'ToDateTimeOperation', 'ToZonedDateTimeOperation'
]);

const FUNCTIONAL_OPS = new Set([
  'FilterOperation', 'MapOperation', 'ReduceOperation', 'SortOperation', 'MinOperation', 'MaxOperation'
]);

/** `arg ` prefix for postfix operators (empty when the op is argument-less). */
function argPrefix(node: AnyNode): string {
  return node['argument'] ? `${r(node['argument'], PREC_POSTFIX)} ` : '';
}

/** Grammar: `(params (',' params)*)? '[' body ']'` — params BEFORE the bracket. */
function renderInlineFunction(fn: { body: unknown; parameters?: Array<{ name: string }> }): string {
  const params = (fn.parameters ?? []).map((p) => p.name);
  const prefix = params.length > 0 ? `${params.join(', ')} ` : '';
  return `${prefix}[${r(fn.body, 1)}]`;
}

function renderSwitchCase(c: AnyNode): string {
  const expr = r(c['expression'], 1);
  const guard = c['guard'] as AnyNode | undefined;
  if (!guard) return `default ${expr}`;
  const guardText = guard['referenceGuard']
    ? refText(guard['referenceGuard'])
    : dispatch(guard['literalGuard'] as AnyNode);
  return `${guardText} then ${expr}`;
}

function dispatchExtended(node: AnyNode, _p: number): string {
  const $type = node.$type;

  if (SIMPLE_POSTFIX.has($type)) return `${argPrefix(node)}${node['operator']}`;

  if (FUNCTIONAL_OPS.has($type)) {
    const fn = node['function'] as { body: unknown; parameters?: Array<{ name: string }> } | undefined;
    return `${argPrefix(node)}${node['operator']}${fn ? ` ${renderInlineFunction(fn)}` : ''}`;
  }

  switch ($type) {
    case 'RosettaExistsExpression': {
      const modifier = node['modifier'] ? `${node['modifier']} ` : '';
      return `${argPrefix(node)}${modifier}exists`;
    }
    case 'RosettaAbsentExpression':
      return `${argPrefix(node)}is absent`;
    case 'RosettaOnlyExistsExpression': {
      const args = (node['args'] as unknown[] | undefined) ?? [];
      if (args.length > 0) return `(${args.map((a) => r(a, 1)).join(', ')}) only exists`;
      return `${argPrefix(node)}only exists`;
    }
    case 'ToEnumOperation':
      return `${argPrefix(node)}to-enum ${refText(node['enumeration'])}`;
    case 'ThenOperation': {
      // Grammar: function=ImplicitInlineFunction (body=OrOperation) — render BARE.
      const fn = node['function'] as { body: unknown } | undefined;
      const body = fn ? ` ${r(fn.body, 2)}` : '';
      return `${r(node['argument'], 1)} then${body}`;
    }
    case 'ChoiceOperation': {
      const attrs = ((node['attributes'] as unknown[] | undefined) ?? []).map(refText).join(', ');
      return `${argPrefix(node)}${node['necessity']} choice ${attrs}`;
    }
    case 'SwitchOperation': {
      const cases = ((node['cases'] as AnyNode[] | undefined) ?? []).map(renderSwitchCase).join(', ');
      return `${argPrefix(node)}switch ${cases}`;
    }
    case 'WithMetaOperation': {
      const entries = ((node['entries'] as AnyNode[] | undefined) ?? [])
        .map((e) => `${refText(e['key'])}: ${r(e['value'], 1)}`).join(', ');
      const suffix = entries ? ` { ${entries} }` : '';
      return `${r(node['argument'], PREC_POSTFIX)} with-meta${suffix}`;
    }
    case 'AsKeyOperation':
      return `${r(node['argument'], 1)} as-key`;
    case 'RosettaConditionalExpression': {
      // Grammar branches are OrOperation — a then/conditional child needs parens.
      const head = `if ${r(node['if'], 2)} then ${r(node['ifthen'], 2)}`;
      return node['full'] ? `${head} else ${r(node['elsethen'], 2)}` : head;
    }
    case 'RosettaConstructorExpression': {
      const typeName = dispatch(node['typeRef'] as AnyNode);
      const typeArgs = ((node['constructorTypeArgs'] as AnyNode[] | undefined) ?? [])
        .map((a) => `${refText(a['parameter'])}: ${r(a['value'], 1)}`).join(', ');
      const argsPart = typeArgs ? `(${typeArgs})` : '';
      const pairs = ((node['values'] as AnyNode[] | undefined) ?? [])
        .map((v) => `${refText(v['key'])}: ${r(v['value'], 1)}`);
      if (node['implicitEmpty']) pairs.push('...');
      const body = pairs.length > 0 ? `{ ${pairs.join(', ')} }` : '{}';
      return `${typeName}${argsPart} ${body}`;
    }
    default:
      throw new UnsupportedExpressionError($type);
  }
}
