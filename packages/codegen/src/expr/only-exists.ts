// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import {
  isChoiceOption,
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
  render: (node: RosettaExpression) => string,
  renderAttribute: (name: string) => string
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
      names.push(isChoiceOption(arg.feature?.ref) ? featureName(arg.feature.ref) : (arg.feature?.$refText ?? ''));
    else if (!parent && isRosettaSymbolReference(arg)) names.push(arg.symbol.$refText);
    else return undefined;
  }
  const attributes = parent ? typeFeatures(expressionType(parent)).map(featureName) : [...ctx.attributeTypes.keys()];
  const allowed = new Set(names);
  const access = (name: string) => (parent ? `__parent?.[${JSON.stringify(name)}]` : renderAttribute(name));
  const checks = attributes.filter((name) => !allowed.has(name)).map((name) => `!runeAttrExists(${access(name)})`);
  const predicate = checks.join(' && ') || 'true';
  return parent ? `((__parent) => ${predicate})(${parentText})` : `(${predicate})`;
}
