import type { RosettaExpression, RosettaFunction } from '../generated/ast.js';

/**
 * Check if an expression node has a generated (synthetic) input marker.
 * This is used during code generation to track inputs that were
 * automatically inferred rather than explicitly declared.
 */
export function hasGeneratedInput(node: RosettaExpression): boolean {
  return (node as unknown as Record<string, unknown>).__generatedInput === true;
}

/**
 * Set the generated input marker on an expression node if not already set.
 * Returns `true` if the marker was set, `false` if it was already present.
 */
export function setGeneratedInputIfAbsent(node: RosettaExpression): boolean {
  const record = node as unknown as Record<string, unknown>;
  if (record.__generatedInput === true) {
    return false;
  }
  record.__generatedInput = true;
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
