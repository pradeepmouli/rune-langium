// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { RosettaExpression, Attribute, InlineFunction } from '@rune-langium/core';
import { expressionIsMany, expressionType, typeFeatures, featureName } from '../expr/navigation.js';
import { expressionMetadataKind } from '../expr/metadata-type.js';
import { fieldMetadataKind, type FieldMetadataKind } from '../expr/metadata-runtime.js';
import type { PythonProjectionContext } from './context.js';
import { PYTHON_RUNTIME_SOURCE } from './python-runtime.js';

export interface PythonRenderContext extends PythonProjectionContext {
  state: { next: number };
}
export type PythonRender = (expression: RosettaExpression, context: PythonRenderContext) => string;
export const pyString = (value: string) => JSON.stringify(value);
export const pyBool = (value: boolean) => (value ? 'True' : 'False');
export function pythonFresh(context: PythonRenderContext, label: string): string {
  return `_rune_${label}_${context.state.next++}`;
}
export function pythonBind(value: string, name: string, body: string): string {
  return `(lambda ${name}: ${body})(${value})`;
}
export function pythonRead(value: string, names: readonly string[], many = false): string {
  return `rune.get(${value}, [${names.map(pyString).join(', ')}]${many ? ', True' : ''})`;
}
export function pythonUnwrap(value: string, kind: FieldMetadataKind | undefined, many = false): string {
  return kind ? `rune.unwrap(${value}${many ? ', True' : ''})` : value;
}
export function pythonNormalize(
  value: string,
  input: FieldMetadataKind | undefined,
  target: FieldMetadataKind | undefined
): string {
  if (input === target) return value;
  if (!target) return pythonUnwrap(value, input);
  return `rune.to${target === 'reference' ? 'Reference' : 'Field'}(${value}, ${pyString(input ?? 'value')})`;
}
export function pythonArgument(
  value: string,
  parameter: Attribute,
  argument: RosettaExpression | undefined,
  context: PythonRenderContext
): string {
  const target = fieldMetadataKind(parameter),
    input = argument ? expressionMetadataKind(argument) : context.implicit?.metadata;
  if (target) value = pythonNormalize(value, input, target);
  else if (input) value = pythonUnwrap(value, input, argument ? expressionIsMany(argument) : context.implicit?.many);
  return `rune.cardinality(${value}, ${parameter.card.inf}, ${parameter.card.unbounded ? 'None' : (parameter.card.sup ?? 1)}, ${pyString(parameter.name)})`;
}
export function pythonInline(
  fn: InlineFunction | undefined,
  context: PythonRenderContext,
  names: readonly string[],
  argument: RosettaExpression | undefined,
  many = false
): PythonRenderContext {
  const locals = new Map(context.locals);
  fn?.parameters.forEach((parameter, index) => locals.set(parameter, names[index] ?? names[0]!));
  const type = expressionType(argument);
  if (!fn?.parameters.length)
    for (const feature of typeFeatures(type)) locals.set(feature, pythonRead(names[0]!, [featureName(feature)], many));
  return {
    ...context,
    locals,
    self: names[0]!,
    implicit: {
      expression: argument,
      name: names[0]!,
      metadata: expressionMetadataKind(argument),
      many,
      ...(type ? { type } : {})
    }
  };
}
/** Read helper dependencies from the authoritative runtime rather than a copied name registry. */
export function pythonHelperDependencies(code: string): string[] {
  const bodies = new Map(
    [...PYTHON_RUNTIME_SOURCE.matchAll(/^def (rune_\w+)\([^]*?(?=^(?:def |class )|$(?![^]))/gm)].map((match) => [
      match[1]!,
      match[0]
    ])
  );
  for (const namespace of PYTHON_RUNTIME_SOURCE.matchAll(/^class (\w+):\n([^]*?)(?=^(?:def |class )|$(?![^]))/gm))
    for (const method of namespace[2]!.matchAll(/^    def (\w+)\([^]*?(?=^    (?:@|def |\w+ =)|$(?![^]))/gm))
      bodies.set(`${namespace[1]}.${method[1]}`, method[0]);
  for (const namespace of PYTHON_RUNTIME_SOURCE.matchAll(/^class (\w+):\n([^]*?)(?=^(?:def |class )|$(?![^]))/gm))
    for (const alias of namespace[2]!.matchAll(/^    (\w+) = staticmethod\((rune_\w+)\)/gm))
      bodies.set(`${namespace[1]}.${alias[1]}`, alias[2]!);
  const required = new Set<string>();
  function collect(text: string) {
    for (const name of bodies.keys())
      if (new RegExp(`\\b${name.replace(/\./g, '\\.')}\\b`).test(text) && !required.has(name)) {
        required.add(name);
        collect(bodies.get(name)!);
      }
  }
  collect(code);
  return [...required].sort();
}
export function pythonDeclarationValue(
  value: string,
  context: PythonRenderContext,
  expression: RosettaExpression
): string {
  return context.preserveMetadata
    ? value
    : pythonUnwrap(value, expressionMetadataKind(expression), expressionIsMany(expression));
}
