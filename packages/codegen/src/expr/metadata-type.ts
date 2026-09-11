// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import {
  isAttribute,
  isInlineFunction,
  isSwitchCaseOrDefault,
  isSwitchOperation,
  isChoice,
  isData,
  isClosureParameter,
  isRosettaFunction,
  isShortcutDeclaration,
  type RosettaExpression
} from '@rune-langium/core';
import { AstUtils } from 'langium';
import { functionAttribute, functionOutput } from '../types/func.js';
import { fieldMetadataKind, type FieldMetadataKind } from './metadata-runtime.js';
import { choiceOptionPaths, expressionType } from './navigation.js';

function mergeMetadataKinds(
  left: FieldMetadataKind | undefined,
  right: FieldMetadataKind | undefined
): FieldMetadataKind | undefined {
  return left === 'reference' || right === 'reference' ? 'reference' : (left ?? right);
}

/** Identify wrappers from declarations, without inspecting ambiguous `value` fields. */
export function expressionMetadataKind(
  expr: RosettaExpression | undefined,
  seen: Set<RosettaExpression> = new Set()
): FieldMetadataKind | undefined {
  if (!expr || seen.has(expr)) return undefined;
  const next = new Set(seen).add(expr);
  switch (expr.$type) {
    case 'RosettaSymbolReference': {
      const func = AstUtils.getContainerOfType(expr, isRosettaFunction);
      const target = expr.symbol.ref ?? (func ? functionAttribute(func, expr.symbol.$refText) : undefined);
      if (isAttribute(target)) return fieldMetadataKind(target);
      if (isClosureParameter(target)) {
        const operation = target.$container.$container;
        return 'argument' in operation ? expressionMetadataKind(operation.argument, next) : undefined;
      }
      if (isRosettaFunction(target)) return fieldMetadataKind(functionOutput(target));
      if (isShortcutDeclaration(target)) return expressionMetadataKind(target.expression, next);
      return undefined;
    }
    case 'RosettaFeatureCall':
    case 'RosettaDeepFeatureCall': {
      const feature = expr.feature?.ref;
      return isAttribute(feature) ? fieldMetadataKind(feature) : undefined;
    }
    case 'RosettaImplicitVariable': {
      const owner = AstUtils.getContainerOfType(expr, (node) => isInlineFunction(node) || isSwitchCaseOrDefault(node));
      const operation = owner?.$container;
      if (isSwitchCaseOrDefault(owner) && isSwitchOperation(operation)) {
        const inputType = expressionType(operation.argument);
        const target = owner.guard?.referenceGuard?.ref;
        if (
          isChoice(inputType) &&
          (isData(target) || isChoice(target)) &&
          !choiceOptionPaths(inputType, target).some((path) => path.length === 0)
        )
          return undefined;
        return expressionMetadataKind(operation.argument, next);
      }
      return operation && 'argument' in operation ? expressionMetadataKind(operation.argument, next) : undefined;
    }
    case 'RosettaSuperCall': {
      const parent = AstUtils.getContainerOfType(expr, isRosettaFunction)?.superFunction?.ref;
      return parent ? fieldMetadataKind(functionOutput(parent)) : undefined;
    }
    case 'AsKeyOperation':
      return 'reference';
    case 'WithMetaOperation': {
      const names = new Set(
        expr.entries.map((entry) =>
          entry.key.ref && 'name' in entry.key.ref ? entry.key.ref.name : entry.key.$refText
        )
      );
      const argumentKind = expressionMetadataKind(expr.argument, next);
      if (names.has('address') || names.has('reference') || argumentKind === 'reference') return 'reference';
      if ([...names].some((name) => name !== 'key' && name !== 'template')) return 'field';
      return argumentKind;
    }
    case 'ThenOperation':
    case 'ReduceOperation':
      return expr.function ? expressionMetadataKind(expr.function.body, next) : undefined;
    case 'MapOperation':
      return expressionMetadataKind(expr.function ? expr.function.body : expr.argument, next);
    case 'FilterOperation':
    case 'FirstOperation':
    case 'LastOperation':
    case 'RosettaOnlyElement':
    case 'DistinctOperation':
    case 'SortOperation':
    case 'ReverseOperation':
    case 'FlattenOperation':
    case 'MinOperation':
    case 'MaxOperation':
      return expr.argument ? expressionMetadataKind(expr.argument, next) : undefined;
    case 'SwitchOperation':
      return expr.cases.reduce<FieldMetadataKind | undefined>(
        (kind, branch) => mergeMetadataKinds(kind, expressionMetadataKind(branch.expression, next)),
        undefined
      );
    case 'ListLiteral': {
      return expr.elements.reduce<FieldMetadataKind | undefined>(
        (kind, element) => mergeMetadataKinds(kind, expressionMetadataKind(element, next)),
        undefined
      );
    }
    case 'DefaultOperation': {
      const left = expressionMetadataKind(expr.left, next);
      const right = expressionMetadataKind(expr.right, next);
      return mergeMetadataKinds(left, right);
    }
    case 'RosettaConditionalExpression': {
      return mergeMetadataKinds(expressionMetadataKind(expr.ifthen, next), expressionMetadataKind(expr.elsethen, next));
    }
    default:
      return undefined;
  }
}
