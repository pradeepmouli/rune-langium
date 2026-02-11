import type { RosettaExpression, RosettaFunction } from '../generated/ast.js';

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
