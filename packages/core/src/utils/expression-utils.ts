// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { isRosettaFunction, type RosettaExpression, type RosettaFunction } from '../generated/ast.js';
import { qualifiedExportPath } from '../naming/qualified-export-path.js';

/**
 * Tracks which expression nodes have a generated (synthetic) input.
 * Uses a WeakMap to avoid mutating AST nodes directly.
 */
const generatedInputs = new WeakMap<RosettaExpression, boolean>();

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
