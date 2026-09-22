// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { isChoice, isData, type RosettaModel } from '@rune-langium/core';
import type { PreviewField } from '@rune-langium/codegen/export';
import type { InstanceRecord } from '@rune-langium/codegen/instances';
import { withInstrumentation } from './instrumentation/core.js';

function referenceTypeFqn(field: PreviewField): string | undefined {
  const valueField = field.kind === 'array' ? field.children[0] : field;
  return valueField.kind === 'object' ? valueField.referencedTypeFqn : undefined;
}

function assignableTypeFqns(field: PreviewField): readonly string[] | undefined {
  const valueField = field.kind === 'array' ? field.children[0] : field;
  return valueField.kind === 'object' ? valueField.assignableTypeFqns : undefined;
}

function typeFqn(node: { $container: { name: string }; name: string }): string {
  return `${node.$container.name}.${node.name}`;
}

/** Whether an instance can be used as one value of a function input field. */
export const isInstanceBindableToField = withInstrumentation(
  function isInstanceBindableToField(
    instance: InstanceRecord,
    field: PreviewField,
    models: ReadonlyArray<RosettaModel>
  ): boolean {
    const expectedType = referenceTypeFqn(field);
    if (!expectedType) return false;
    const hydratedAssignableTypes = assignableTypeFqns(field);
    if (hydratedAssignableTypes) return hydratedAssignableTypes.includes(instance.typeFqn);
    if (instance.typeFqn === expectedType) return true;
    const candidates = new Map(
      models
        .flatMap((model) => model.elements)
        .filter((element) => isData(element) || isChoice(element))
        .map((element) => [typeFqn(element), element] as const)
    );
    let candidate = candidates.get(instance.typeFqn);
    const visited = new Set<string>();
    while (candidate) {
      const candidateFqn = typeFqn(candidate);
      if (candidateFqn === expectedType) return true;
      if (visited.has(candidateFqn) || !isData(candidate)) return false;
      visited.add(candidateFqn);
      const parent = candidate.superType?.ref;
      candidate = parent && (isData(parent) || isChoice(parent)) ? parent : undefined;
    }
    return false;
  },
  { op: 'isInstanceBindableToField' }
);
