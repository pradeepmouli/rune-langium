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
 *
 * Tier 7 is the ONE exception to "left minPrec = myPrec": grammar
 * `BinaryOperationRule` wraps its alternatives in `(...)?`, not `(...)*`
 * like every other tier — contains/disjoint/default/join apply AT MOST
 * ONCE, so there is no left-recursive same-tier chain. A same-tier LEFT
 * child can therefore only occur via an explicit parenthesized
 * sub-expression and must always be wrapped: tier 7's left minPrec is
 * `p + 1`, matching its right minPrec, not `p`.
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

/**
 * Reserved keywords of the Rune DSL grammar. SNAPSHOTTED (a frozen array
 * literal, not a runtime query) from `RuneDsl.parser.Lexer.definition`'s
 * exact-match keyword token types — which Langium generates from the
 * grammar file — MINUS the words the grammar's `ValidID`/`TypeParameterValidID`
 * rules explicitly whitelist as legal bare identifiers in every reference
 * position `refText` renders (`feature`/`attributes`/`key` via `ValidID`;
 * `symbol`/`enumeration`/`referenceGuard` via `QualifiedName = ValidID
 * ('.' ValidID)*`; `parameter` via `TypeParameterValidID = ValidID | 'min' | 'max'`):
 *   ValidID:            ID | 'condition' | 'source' | 'value' | 'version' | 'pattern' | 'scope'
 *   TypeParameterValidID adds:  'min' | 'max'
 * Verified empirically (`a -> value`, `a -> min`, etc. all parse bare —
 * `a -> type` does not, `type` is NOT in `ValidID`'s whitelist).
 *
 * REGENERATE this list (re-derive from the live lexer, e.g. a throwaway
 * `Object.keys(createRuneDslServices().RuneDsl.parser.Lexer.tokenTypes)`
 * probe) if the grammar's keyword set changes — it is a point-in-time
 * snapshot, not kept in sync automatically. A runtime import of core's
 * services was considered and rejected: `render-expression.ts` is part of
 * the browser-safe `@rune-langium/codegen/rosetta` subpath (no fs/ExcelJS/
 * generator imports — see `rosetta-render-core.ts`'s module doc), and
 * pulling in `createRuneDslServices` would drag the full Langium parser
 * into that bundle for every consumer, not just tests.
 *
 * A name colliding with a REMAINING reserved word can still be a legal
 * identifier (e.g. an attribute literally named `type`), but only when
 * escaped with a leading `^` (Langium/Xtext's standard keyword-escape
 * prefix). `$refText` strips the `^` before the reference reaches us, so
 * the renderer must independently detect the collision and re-add it —
 * otherwise `-> type` is emitted where the source had `-> ^type`, and the
 * rendered text fails to reparse (`P1` corpus sweep finding).
 */
const VALID_ID_EXCEPTIONS = new Set(['condition', 'source', 'value', 'version', 'pattern', 'scope', 'min', 'max']);
const RESERVED_KEYWORDS = new Set(
  [
    'structured_provision', 'regulatoryReference', 'to-zoned-date-time', 'rationale_author',
    'post-condition', 'condition-func', 'condition-path', 'reportedField', 'ruleReference',
    'only-element', 'to-date-time', 'docReference', 'displayName', 'componentID', 'rosettaPath',
    'eligibility', 'annotation', 'recordType', 'dateFormat', 'removeHtml', 'definition',
    'namespace', 'condition', 'basicType', 'typeAlias', 'to-string', 'to-number', 'with-meta',
    'provision', 'rationale', 'real-time', 'reporting', 'isProduct', 'override', 'function',
    'metaType', 'contains', 'disjoint', 'distinct', 'multiple', 'optional', 'required',
    'standard', 'version', 'extends', 'synonym', 'library', 'default', 'flatten', 'reverse',
    'to-time', 'to-enum', 'to-date', 'extract', 'pattern', 'segment', 'isEvent', 'import',
    'prefix', 'choice', 'inputs', 'output', 'source', 'as-key', 'exists', 'absent', 'one-of',
    'to-int', 'switch', 'reduce', 'filter', 'single', 'mapper', 'corpus', 'report', 'scope',
    'alias', 'count', 'first', 'super', 'empty', 'False', 'value', 'merge', 'enums', 'ASATP',
    'using', 'label', 'type', 'enum', 'func', 'then', 'join', 'only', 'last', 'sort', 'item',
    'True', 'else', 'meta', 'path', 'hint', 'maps', 'when', 'body', 'rule', 'from', 'with',
    'root', 'set', 'add', 'and', 'sum', 'min', 'max', 'any', 'all', 'tag', 'for', 'as', 'or',
    'is', 'if', 'to', 'in', 'e', 'E'
  ].filter((kw) => !VALID_ID_EXCEPTIONS.has(kw))
);

/**
 * Escape `name` with a leading `^` if it collides with a reserved keyword.
 * `name` may be a dotted `QualifiedName` (`symbol`/`enumeration`/`referenceGuard`
 * refs) — the parser's per-segment `^`-strip happens at the ID-token level
 * (`convertID` runs once per `ValidID` match), so `$refText` for `foo.^type`
 * arrives as `"foo.type"`, NOT `"foo.^type"` with the caret preserved on the
 * later segment. Checking the whole dotted string against `RESERVED_KEYWORDS`
 * therefore never matches (`"foo.type"` isn't itself a keyword) — each
 * segment must be escaped independently and rejoined.
 */
function escapeId(name: string): string {
  return name.split('.').map((segment) => (RESERVED_KEYWORDS.has(segment) ? `^${segment}` : segment)).join('.');
}

const refText = (r: unknown): string => escapeId((r as { $refText?: string } | undefined)?.$refText ?? '');

const PREC_CONDITIONAL = 0;
const PREC_POSTFIX = 8;

function prec(node: AnyNode): number {
  switch (node.$type) {
    // Both always parenthesize as a non-top-level child: RosettaConditionalExpression
    // for readability (see its dispatch case); SwitchOperation and ChoiceOperation
    // because their own bodies are BARE comma-separated lists
    // (`cases+=SwitchCaseOrDefault (',' cases+=SwitchCaseOrDefault)*` /
    // `attributes+=ValidID (',' attributes+=ValidID)*`) — shape-identical to any
    // bare comma-list position they might sit in (call rawArgs, constructor
    // values/constructorTypeArgs, with-meta entries, ListLiteral elements,
    // multi-arg only-exists args). Unparenthesized, a trailing element of the
    // outer list is silently absorbed into the switch/choice's own list instead
    // of staying a separate outer element — confirmed for both constructs via
    // direct AST-shape inspection (not just a reparse-error check, which passes
    // even when this happens): `Foo(x switch a then 1, default 0, y)` folds `y`
    // into the switch; `Foo(optional choice a, b, y)` folds `y` into `choice`'s
    // `attributes`. Precedence 0 makes every call site in this file — postfix
    // arguments (minPrec 8), binary operands (minPrec 1+), and bare list
    // elements (minPrec 1) — wrap them via the ordinary `r()` mechanism, so no
    // dedicated comma-scanning helper is needed.
    case 'RosettaConditionalExpression':
    case 'SwitchOperation':
    case 'ChoiceOperation': return PREC_CONDITIONAL;
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
      // Tier 7 is non-associative (grammar `(...)?`, not `(...)*`) — a
      // same-tier left child only occurs via explicit parens, so it must
      // wrap at p + 1 like the right side (see module doc).
      const rhs = `${node['operator']} ${r(node['right'], p + 1)}`;
      return node['left'] ? `${r(node['left'], p + 1)} ${rhs}` : rhs;
    }
    case 'JoinOperation': {
      const left = node['left'] ? `${r(node['left'], p + 1)} ` : '';
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
