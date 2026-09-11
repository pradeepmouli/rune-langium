// SPDX-License-Identifier: MIT
import {
  isListLiteral,
  isRosettaFeatureCall,
  isRosettaSymbolReference,
  type RosettaExpression,
  type RosettaOnlyExistsExpression
} from '@rune-langium/core';
import { expressionType, featureName, typeFeatures } from './navigation.js';
import type { ExpressionTranspilerContext } from './transpiler.js';

export function renderOnlyExists(
  expr: RosettaOnlyExistsExpression,
  ctx: ExpressionTranspilerContext,
  render: (node: RosettaExpression) => string
): string | undefined {
  const args = expr.args.length
    ? expr.args
    : isListLiteral(expr.argument)
      ? expr.argument.elements
      : expr.argument
        ? [expr.argument]
        : [];
  if (!args.length) return undefined;
  const first = args[0]!;
  const parent = isRosettaFeatureCall(first) ? first.receiver : undefined;
  const parentText = parent ? render(parent) : ctx.selfName;
  const names: string[] = [];
  for (const arg of args) {
    if (parent && isRosettaFeatureCall(arg) && arg.receiver && render(arg.receiver) === parentText)
      names.push(arg.feature?.$refText ?? '');
    else if (!parent && isRosettaSymbolReference(arg)) names.push(arg.symbol.$refText);
    else return undefined;
  }
  const attributes = parent ? typeFeatures(expressionType(parent)).map(featureName) : [...ctx.attributeTypes.keys()];
  const access = (name: string) =>
    parent ? `__parent[${JSON.stringify(name)}]` : (ctx.localBindings?.get(name) ?? `${ctx.selfName}.${name}`);
  const checks = names.map((name) => `runeAttrExists(${access(name)})`);
  for (const name of attributes) if (!names.includes(name)) checks.push(`!runeAttrExists(${access(name)})`);
  return parent
    ? `((__parent) => __parent != null && ${checks.join(' && ')})(${parentText})`
    : `(${checks.join(' && ')})`;
}
