// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import {
  isInlineFunction,
  isRosettaExpression,
  isRosettaFunction,
  isRosettaTypeAlias,
  type RosettaExpression,
  type RosettaType,
  type RosettaFunction
} from '../generated/ast.js';
import { qualifiedExportPath } from '../naming/qualified-export-path.js';
import type { AstNode } from 'langium';

/**
 * Tracks which expression nodes have a generated (synthetic) input.
 * Uses a WeakMap to avoid mutating AST nodes directly.
 */
const generatedInputs = new WeakMap<RosettaExpression, boolean>();

/** Resolve a declared type without looping through recursive aliases. */
export function resolveTypeAliases(
  type: RosettaType | undefined,
  seen = new Set<RosettaType>()
): RosettaType | undefined {
  while (type && isRosettaTypeAlias(type)) {
    if (seen.has(type)) return undefined;
    seen.add(type);
    type = type.typeCall.type.ref;
  }
  return type;
}

/**
 * Check if an expression node has a generated (synthetic) input marker.
 * This is used during code generation to track inputs that were
 * automatically inferred rather than explicitly declared.
 */
export function hasGeneratedInput(node: RosettaExpression): boolean {
  return generatedInputs.get(node) === true;
}

/**
 * Set the generated input marker on an expression node if not already set.
 * Returns `true` if the marker was set, `false` if it was already present.
 */
export function setGeneratedInputIfAbsent(node: RosettaExpression): boolean {
  if (generatedInputs.get(node) === true) {
    return false;
  }
  generatedInputs.set(node, true);
  return true;
}

/**
 * Get all input attributes from a RosettaFunction.
 */
export function getFunctionInputs(func: RosettaFunction) {
  return func.inputs ?? [];
}

/**
 * Get the output attribute from a RosettaFunction.
 */
export function getFunctionOutput(func: RosettaFunction) {
  return func.output;
}

/** Resolve a dispatch overload to its namespace's base declaration. */
export function getFunctionSignature(func: RosettaFunction, declarations?: Iterable<RosettaFunction>): RosettaFunction {
  if (!func.dispatchAttribute) return func;
  const name = qualifiedExportPath(func.$container.name, func.name);
  for (const candidate of declarations ?? func.$container.elements.filter(isRosettaFunction)) {
    if (!candidate.dispatchAttribute && qualifiedExportPath(candidate.$container.name, candidate.name) === name)
      return candidate;
  }
  // Scope construction supplies declarations explicitly to avoid recursively resolving its own selector.
  if (declarations) return func;
  const owner = func.dispatchAttribute.ref?.$container;
  return isRosettaFunction(owner) ? owner : func;
}

/** Resolve an explicit operation input or the input of its enclosing pipeline. */
export function getOperationArgument(expr: RosettaExpression): RosettaExpression | undefined {
  if ('argument' in expr && expr.argument) return expr.argument;
  let owner: AstNode | undefined = expr.$container;
  while (owner) {
    if (isInlineFunction(owner) && isRosettaExpression(owner.$container)) {
      const operation = owner.$container;
      if ('argument' in operation && operation.argument) return operation.argument;
    }
    owner = owner.$container;
  }
  return undefined;
}

/** Shared operator result-type propagation; symbol lookup belongs to the caller. */
export function resolveOperationType<T>(
  expr: RosettaExpression,
  resolve: (expression: RosettaExpression) => T | undefined,
  resolveType?: (type: RosettaType) => T | undefined
): T | undefined {
  const from = (expression: RosettaExpression | undefined) => (expression ? resolve(expression) : undefined);
  switch (expr.$type) {
    case 'AsOperation': {
      const type = resolveTypeAliases(expr.type.ref);
      return type ? resolveType?.(type) : undefined;
    }
    case 'FilterOperation':
    case 'SortOperation':
    case 'DistinctOperation':
    case 'ReverseOperation':
    case 'FlattenOperation':
    case 'FirstOperation':
    case 'LastOperation':
    case 'MinOperation':
    case 'MaxOperation':
    case 'RosettaOnlyElement':
    case 'AsKeyOperation':
    case 'WithMetaOperation':
      return from(getOperationArgument(expr));
    case 'MapOperation':
    case 'ThenOperation':
    case 'ReduceOperation':
      return from(expr.function?.body ?? getOperationArgument(expr));
    case 'DefaultOperation':
      return from(expr.left) ?? from(expr.right);
    case 'RosettaConditionalExpression':
      return from(expr.ifthen) ?? from(expr.elsethen);
    case 'SwitchOperation':
      for (const branch of expr.cases) {
        const type = from(branch.expression);
        if (type !== undefined) return type;
      }
      return undefined;
    case 'ListLiteral':
      for (const element of expr.elements) {
        const type = from(element);
        if (type !== undefined) return type;
      }
      return undefined;
    default:
      return undefined;
  }
}
