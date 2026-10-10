// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import {
  isArithmeticOperation,
  isEqualityOperation,
  isComparisonOperation,
  isLogicalOperation,
  isRosettaExistsExpression,
  isRosettaAbsentExpression,
  isAttribute,
  isInlineFunction,
  type Attribute,
  isRosettaBooleanLiteral,
  isRosettaFeatureCall,
  isRosettaIntLiteral,
  isRosettaNumberLiteral,
  isRosettaFunction,
  isRosettaEnumValue,
  isRosettaEnumeration,
  isRosettaConstructorExpression,
  isRosettaStringLiteral,
  isRosettaSymbolReference,
  isShortcutDeclaration,
  type RosettaExpression
} from '@rune-langium/core';
import { AstUtils } from 'langium';
import { expressionIsMany, expressionType, featureIsRequired } from './navigation.js';
import { hasFieldMetadata } from './metadata-runtime.js';

type ScalarKind = 'number' | 'string' | 'boolean';

function scalarKind(expression: RosettaExpression | undefined): ScalarKind | undefined {
  if (isRosettaBooleanLiteral(expression)) return 'boolean';
  if (
    isRosettaStringLiteral(expression) ||
    (isRosettaSymbolReference(expression) && isRosettaEnumValue(expression.symbol.ref))
  )
    return 'string';
  if (isRosettaIntLiteral(expression) || isRosettaNumberLiteral(expression)) return 'number';
  const type = expressionType(expression);
  const kind = type?.name;
  if (isRosettaEnumeration(type)) return 'string';
  return kind === 'int' || kind === 'number' ? 'number' : kind === 'string' || kind === 'boolean' ? kind : undefined;
}

/** Inputs and the current validated Data record are safe; guarded implicit lookups are not. */
export function attributeReferenceIsValidated(expression: RosettaExpression, attribute: Attribute): boolean {
  return isRosettaFunction(attribute.$container)
    ? attribute.$containerProperty === 'inputs'
    : !AstUtils.getContainerOfType(expression, isRosettaFunction) &&
        !AstUtils.getContainerOfType(expression, isInlineFunction);
}

/** Presence is independent of whether a required receiver is an object or a primitive. */
export function expressionIsPresent(
  expression: RosettaExpression | undefined,
  visiting = new Set<RosettaExpression>()
): boolean {
  if (!expression || visiting.has(expression) || expressionIsMany(expression)) return false;
  visiting.add(expression);
  try {
    if (isRosettaSymbolReference(expression)) {
      const declaration = expression.symbol.ref;
      if (isShortcutDeclaration(declaration)) return expressionIsPresent(declaration.expression, visiting);
      return (
        isAttribute(declaration) &&
        attributeReferenceIsValidated(expression, declaration) &&
        featureIsRequired(declaration) &&
        !hasFieldMetadata(declaration)
      );
    }
    if (isRosettaFeatureCall(expression)) {
      const declaration = expression.feature?.ref;
      if (isRosettaEnumValue(declaration)) return true;
      return (
        isAttribute(declaration) &&
        featureIsRequired(declaration) &&
        !hasFieldMetadata(declaration) &&
        expressionIsPresent(expression.receiver, visiting)
      );
    }
    return (
      isRosettaBooleanLiteral(expression) ||
      isRosettaStringLiteral(expression) ||
      isRosettaIntLiteral(expression) ||
      isRosettaNumberLiteral(expression) ||
      isEqualityOperation(expression) ||
      isComparisonOperation(expression) ||
      isLogicalOperation(expression) ||
      isRosettaExistsExpression(expression) ||
      isRosettaAbsentExpression(expression) ||
      isRosettaConstructorExpression(expression) ||
      requiredScalarKind(expression) !== undefined
    );
  } finally {
    visiting.delete(expression);
  }
}

/** Prove a non-null primitive using linked declarations, never identifier spelling. */
export function requiredScalarKind(
  expression: RosettaExpression | undefined,
  visiting = new Set<RosettaExpression>()
): ScalarKind | undefined {
  if (!expression || visiting.has(expression) || expressionIsMany(expression)) return undefined;
  visiting.add(expression);
  const primitive = scalarKind(expression);
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
      return isAttribute(declaration) &&
        attributeReferenceIsValidated(expression, declaration) &&
        featureIsRequired(declaration) &&
        !hasFieldMetadata(declaration)
        ? primitive
        : undefined;
    }
    if (isRosettaFeatureCall(expression)) {
      const declaration = expression.feature?.ref;
      // Required children of optional receivers can still be absent.
      if (!isAttribute(declaration) || !featureIsRequired(declaration) || hasFieldMetadata(declaration))
        return undefined;
      return expressionIsPresent(expression.receiver, visiting) ? primitive : undefined;
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

/** Optional primitives and enums retain native equality over validated JSON values. */
export function scalarEqualityOperands(
  left: RosettaExpression | undefined,
  right: RosettaExpression
): ScalarKind | undefined {
  if (expressionIsMany(left) || expressionIsMany(right)) return undefined;
  const kind = scalarKind(left);
  return kind && kind === scalarKind(right) ? kind : undefined;
}

function finiteJsonNumber(expression: RosettaExpression | undefined, visiting = new Set<RosettaExpression>()): boolean {
  if (!expression || visiting.has(expression)) return false;
  visiting.add(expression);
  try {
    if (isRosettaIntLiteral(expression) || isRosettaNumberLiteral(expression))
      return Number.isFinite(Number(expression.value));
    if (isRosettaSymbolReference(expression)) {
      const declaration = expression.symbol.ref;
      if (isShortcutDeclaration(declaration)) return finiteJsonNumber(declaration.expression, visiting);
      return (
        isAttribute(declaration) &&
        !(isRosettaFunction(declaration.$container) && declaration.$containerProperty === 'output')
      );
    }
    if (isRosettaFeatureCall(expression)) return finiteJsonNumber(expression.receiver, visiting);
    return false;
  } finally {
    visiting.delete(expression);
  }
}

/** Computed numbers can be NaN even when their JSON inputs were finite. */
export function nativeEqualityOperands(left: RosettaExpression | undefined, right: RosettaExpression): boolean {
  const kind = scalarEqualityOperands(left, right);
  if (kind !== 'number') return kind !== undefined;
  return finiteJsonNumber(left) && finiteJsonNumber(right);
}
