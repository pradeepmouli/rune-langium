// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import {
  getOperationArgument,
  isAttribute,
  isChoiceOption,
  isInlineFunction,
  isSwitchCaseOrDefault,
  isSwitchOperation,
  isChoice,
  isRosettaType,
  type Choice,
  isClosureParameter,
  isRosettaFunction,
  isShortcutDeclaration,
  type RosettaExpression,
  type RosettaType
} from '@rune-langium/core';
import { AstUtils } from 'langium';
import { functionAttribute, functionOutput } from '../types/func.js';
import { fieldMetadataKind, type FieldMetadataKind } from './metadata-runtime.js';
import { choiceOptionPaths, expressionType, typeFeatures, featureName, resolveType } from './navigation.js';

function mergeMetadataKinds(
  left: FieldMetadataKind | undefined,
  right: FieldMetadataKind | undefined
): FieldMetadataKind | undefined {
  return left === 'reference' || right === 'reference' ? 'reference' : (left ?? right);
}

/** Keep each declared path's representation alongside the common selection kind. */
export function choiceSelection(choice: Choice, target: RosettaType, exact = false) {
  const paths = choiceOptionPaths(choice, target, exact).map((path) => {
    let type: RosettaType | undefined = choice;
    return path.map((name) => {
      const feature = typeFeatures(type).find((feature) => featureName(feature) === name);
      type = resolveType(feature?.typeCall);
      return { name, metadataKind: feature && 'annotations' in feature ? fieldMetadataKind(feature) : undefined };
    });
  });
  const metadataKind = paths.reduce<FieldMetadataKind | undefined>(
    (kind, path) => mergeMetadataKinds(kind, path[path.length - 1]?.metadataKind),
    undefined
  );
  return { paths, metadataKind };
}

export function choiceSelectionMetadata(
  choice: Choice,
  target: RosettaType,
  exact = false
): FieldMetadataKind | undefined {
  return choiceSelection(choice, target, exact).metadataKind;
}

/** Identify wrappers from declarations, without inspecting ambiguous `value` fields. */
export function expressionMetadataKind(
  expr: RosettaExpression | undefined,
  seen: Set<RosettaExpression> = new Set()
): FieldMetadataKind | undefined {
  if (!expr || seen.has(expr)) return undefined;
  const next = new Set(seen).add(expr);
  switch (expr.$type) {
    case 'AsOperation': {
      const argument = getOperationArgument(expr);
      const input = expressionType(argument);
      if (!isChoice(input)) return expressionMetadataKind(argument, next);
      const target = expr.type.ref;
      if (!target) return undefined;
      return choiceSelectionMetadata(input, target, true);
    }
    case 'RosettaSymbolReference': {
      const func = AstUtils.getContainerOfType(expr, isRosettaFunction);
      const target = expr.symbol.ref ?? (func ? functionAttribute(func, expr.symbol.$refText) : undefined);
      if (isAttribute(target) || isChoiceOption(target)) return fieldMetadataKind(target);
      if (isClosureParameter(target)) {
        const operation = target.$container.$container;
        return expressionMetadataKind(getOperationArgument(operation), next);
      }
      if (isRosettaFunction(target)) return fieldMetadataKind(functionOutput(target));
      if (isShortcutDeclaration(target)) return expressionMetadataKind(target.expression, next);
      return undefined;
    }
    case 'RosettaFeatureCall':
    case 'RosettaDeepFeatureCall': {
      const feature = expr.feature?.ref;
      return isAttribute(feature) || isChoiceOption(feature) ? fieldMetadataKind(feature) : undefined;
    }
    case 'RosettaImplicitVariable': {
      const owner = AstUtils.getContainerOfType(expr, (node) => isInlineFunction(node) || isSwitchCaseOrDefault(node));
      const operation = owner?.$container;
      if (isSwitchCaseOrDefault(owner) && isSwitchOperation(operation)) {
        const inputType = expressionType(getOperationArgument(operation));
        const target = owner.guard?.referenceGuard?.ref;
        if (
          isChoice(inputType) &&
          isRosettaType(target) &&
          !choiceOptionPaths(inputType, target).some((path) => path.length === 0)
        )
          return choiceSelectionMetadata(inputType, target);
        return expressionMetadataKind(getOperationArgument(operation), next);
      }
      return operation && 'argument' in operation
        ? expressionMetadataKind(getOperationArgument(operation), next)
        : undefined;
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
    case 'ReduceOperation':
    case 'ThenOperation':
    case 'MapOperation':
      return expressionMetadataKind(expr.function ? expr.function.body : getOperationArgument(expr), next);
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
      return expressionMetadataKind(getOperationArgument(expr), next);
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
