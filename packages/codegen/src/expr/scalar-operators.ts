// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import {
  isArithmeticOperation,
  isAttribute,
  isRosettaBooleanLiteral,
  isRosettaFeatureCall,
  isRosettaIntLiteral,
  isRosettaNumberLiteral,
  isRosettaFunction,
  isRosettaStringLiteral,
  isRosettaSymbolReference,
  isShortcutDeclaration,
  type RosettaExpression
} from '@rune-langium/core';
import { expressionIsMany, expressionType, featureIsRequired } from './navigation.js';
import { hasFieldMetadata } from './metadata-runtime.js';

type ScalarKind = 'number' | 'string' | 'boolean';

/** Prove a non-null primitive using linked declarations, never identifier spelling. */
export function requiredScalarKind(
  expression: RosettaExpression | undefined,
  visiting = new Set<RosettaExpression>()
): ScalarKind | undefined {
  if (!expression || visiting.has(expression) || expressionIsMany(expression)) return undefined;
  visiting.add(expression);
  const kind = expressionType(expression)?.name;
  const primitive =
    kind === 'int' || kind === 'number' ? 'number' : kind === 'string' || kind === 'boolean' ? kind : undefined;
  try {
    if (isRosettaBooleanLiteral(expression)) return 'boolean';
    if (isRosettaStringLiteral(expression)) return 'string';
    if (isRosettaIntLiteral(expression) || isRosettaNumberLiteral(expression)) return 'number';
    if (isRosettaSymbolReference(expression)) {
      const declaration = expression.symbol.ref;
      if (isShortcutDeclaration(declaration)) return requiredScalarKind(declaration.expression, visiting);
      // Output cardinality is enforced at return, after potentially absent writes.
      // It cannot prove that the accumulator (or an alias of it) is initialized.
      if (
        isAttribute(declaration) &&
        isRosettaFunction(declaration.$container) &&
        declaration.$containerProperty === 'output'
      )
        return undefined;
      return isAttribute(declaration) && featureIsRequired(declaration) && !hasFieldMetadata(declaration)
        ? primitive
        : undefined;
    }
    if (isRosettaFeatureCall(expression)) {
      const declaration = expression.feature?.ref;
      // Required children of optional receivers can still be absent. Navigation
      // retains its lifting helper until the complete receiver is proven present.
      if (!isAttribute(declaration) || !featureIsRequired(declaration) || hasFieldMetadata(declaration))
        return undefined;
      return requiredScalarKind(expression.receiver, visiting) ? primitive : undefined;
    }
    if (isArithmeticOperation(expression)) {
      const left = requiredScalarKind(expression.left, visiting);
      const right = requiredScalarKind(expression.right, visiting);
      if (left === right && (left === 'number' || (left === 'string' && expression.operator === '+'))) return left;
    }
    return undefined;
  } finally {
    visiting.delete(expression);
  }
}

export function nativeScalarOperands(
  left: RosettaExpression | undefined,
  right: RosettaExpression
): ScalarKind | undefined {
  const kind = requiredScalarKind(left);
  return kind && kind === requiredScalarKind(right) ? kind : undefined;
}

/** Runtime value equality considers NaN equal to NaN; only finite literals can elide that rule. */
export function nativeEqualityOperands(left: RosettaExpression | undefined, right: RosettaExpression): boolean {
  const kind = nativeScalarOperands(left, right);
  if (kind !== 'number') return kind !== undefined;
  return Boolean(
    left &&
    (isRosettaIntLiteral(left) || isRosettaNumberLiteral(left)) &&
    (isRosettaIntLiteral(right) || isRosettaNumberLiteral(right)) &&
    Number.isFinite(Number(left.value)) &&
    Number.isFinite(Number(right.value))
  );
}
