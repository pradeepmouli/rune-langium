// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { TypeGraphNode } from '@rune-langium/visual-editor';
import { withInstrumentation } from './instrumentation/core.js';

interface FunctionOutputShape {
  typeCall?: { type?: { $refText?: string } };
  card?: { inf?: number; sup?: number; unbounded?: boolean };
}

interface NodeDataShape {
  $type?: string;
  name?: string;
  output?: FunctionOutputShape;
}

export interface FunctionOutputTarget {
  typeFqn: string;
  kind: 'data' | 'choice';
}

function isSingular(card: FunctionOutputShape['card']): boolean {
  return card?.inf === 1 && card.sup === 1 && card.unbounded !== true;
}

/**
 * Resolves the saved-instance target from the function declaration itself.
 * A result value is never used to infer its type.
 */
export const resolveFunctionOutputTarget = withInstrumentation(
  function resolveFunctionOutputTarget(
    nodesById: ReadonlyMap<string, TypeGraphNode>,
    functionFqn: string | null
  ): FunctionOutputTarget | undefined {
    if (!functionFqn) return undefined;
    const functionNode = nodesById.get(functionFqn);
    if (!functionNode) return undefined;
    const functionData = functionNode.data as NodeDataShape;
    const output = functionData.output;
    const reference = output?.typeCall?.type?.$refText;
    if (functionData.$type !== 'RosettaFunction' || !reference || !isSingular(output.card)) return undefined;

    const sameNamespaceId = `${functionNode.meta.namespace}.${reference}`;
    const candidates = [nodesById.get(reference), nodesById.get(sameNamespaceId)].filter(
      (node): node is TypeGraphNode => node !== undefined
    );
    const target = candidates.find((node) => {
      const data = node.data as NodeDataShape;
      return data.$type === 'Data' || data.$type === 'Choice';
    });
    if (!target) return undefined;
    const data = target.data as NodeDataShape;
    return { typeFqn: target.id, kind: data.$type === 'Data' ? 'data' : 'choice' };
  },
  { op: 'resolveFunctionOutputTarget' }
);
