// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/** Lower a resolved Rosetta function symbol reference to the TS emitter's API. */
import {
  type RosettaSymbolReference,
  type RosettaExpression,
  type Attribute,
  isRosettaFunction
} from '@rune-langium/core';
import { functionInputs } from '../types/func.js';

export function renderResolvedFunctionCall(
  node: RosettaSymbolReference,
  renderArgument: (argument: RosettaExpression, parameter: Attribute) => string,
  report?: (message: string) => void,
  implicitArgument?: string,
  prepareArgument: (value: string, parameter: Attribute, argument?: RosettaExpression) => string = (value) => value
): string | undefined {
  const func = node.symbol.ref;
  if (!isRosettaFunction(func)) return undefined;
  const args = node.rawArgs;
  const inputs = functionInputs(func);
  if (!node.explicitArguments && args.length === 0 && inputs.length === 0) return `${func.name}({})`;
  if (!node.explicitArguments && inputs.length === 1 && implicitArgument !== undefined) {
    return `${func.name}({ ${inputs[0]!.name}: ${prepareArgument(implicitArgument, inputs[0]!)} })`;
  }
  if (!node.explicitArguments) return undefined;
  if (args.length !== inputs.length) {
    report?.(`Function '${func.name}' called with ${args.length} argument(s), expected ${inputs.length}`);
    return undefined;
  }
  return `${func.name}({ ${args.map((arg, index) => `${inputs[index]!.name}: ${prepareArgument(renderArgument(arg, inputs[index]!), inputs[index]!, arg)}`).join(', ')} })`;
}
