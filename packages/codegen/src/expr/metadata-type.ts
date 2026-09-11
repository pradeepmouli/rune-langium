// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { isAttribute, isRosettaFunction, isShortcutDeclaration, type RosettaExpression } from '@rune-langium/core';
import { AstUtils } from 'langium';
import { functionAttribute, functionOutput } from '../types/func.js';
import { fieldMetadataKind, type FieldMetadataKind } from './metadata-runtime.js';

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
      if (isRosettaFunction(target)) return fieldMetadataKind(functionOutput(target));
      if (isShortcutDeclaration(target)) return expressionMetadataKind(target.expression, next);
      return undefined;
    }
    case 'RosettaFeatureCall':
    case 'RosettaDeepFeatureCall': {
      const feature = expr.feature?.ref;
      return isAttribute(feature) ? fieldMetadataKind(feature) : undefined;
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
    case 'MapOperation':
    case 'ReduceOperation':
      return expr.function ? expressionMetadataKind(expr.function.body, next) : undefined;
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
    case 'ListLiteral': {
      const kinds = expr.elements.map((element) => expressionMetadataKind(element, next));
      return kinds.length && kinds.every((kind) => kind === kinds[0]) ? kinds[0] : undefined;
    }
    case 'RosettaConditionalExpression': {
      const consequent = expressionMetadataKind(expr.ifthen, next);
      return !expr.elsethen || expressionMetadataKind(expr.elsethen, next) === consequent ? consequent : undefined;
    }
    default:
      return undefined;
  }
}
