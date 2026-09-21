// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { getFunctionOutput, isChoice, isData, isRosettaFunction, type RosettaModel } from '@rune-langium/core';
import { withInstrumentation } from './instrumentation/core.js';

export interface FunctionOutputTarget {
  typeFqn: string;
  kind: 'data' | 'choice';
}

function isSingular(card: { inf?: number; sup?: number; unbounded?: boolean } | undefined): boolean {
  return card?.inf === 1 && card.sup === 1 && card.unbounded !== true;
}

/**
 * Resolves the saved-instance target from the function declaration itself.
 * A result value is never used to infer its type.
 */
export const resolveFunctionOutputTarget = withInstrumentation(
  function resolveFunctionOutputTarget(
    models: ReadonlyArray<RosettaModel>,
    functionFqn: string | null
  ): FunctionOutputTarget | undefined {
    if (!functionFqn) return undefined;
    const functionNode = models
      .flatMap((model) => model.elements)
      .find((element) => isRosettaFunction(element) && `${element.$container.name}.${element.name}` === functionFqn);
    if (!functionNode || !isRosettaFunction(functionNode)) return undefined;
    const output = getFunctionOutput(functionNode);
    const target = output?.typeCall.type.ref;
    if (!output || !target || !isSingular(output.card) || (!isData(target) && !isChoice(target))) return undefined;
    return {
      typeFqn: `${target.$container.name}.${target.name}`,
      kind: isData(target) ? 'data' : 'choice'
    };
  },
  { op: 'resolveFunctionOutputTarget' }
);
