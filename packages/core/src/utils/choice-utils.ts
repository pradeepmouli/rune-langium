// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { isChoice, type Choice, type ChoiceOption, type Condition } from '../generated/ast.js';
import { resolveTypeAliases } from './expression-utils.js';

export function choiceOptionFieldName(optionTypeName: string): string {
  return optionTypeName.charAt(0).toLowerCase() + optionTypeName.slice(1);
}

/** Declared option paths, including nested choices; data fields are not choice arms. */
export function getChoiceOptionPaths(choice: Choice, seen = new Set<Choice>()): ChoiceOption[][] {
  if (seen.has(choice)) return [];
  const next = new Set(seen).add(choice);
  return choice.attributes.flatMap((option) => {
    const type = resolveTypeAliases(option.typeCall.type.ref);
    return [[option], ...(isChoice(type) ? getChoiceOptionPaths(type, next).map((path) => [option, ...path]) : [])];
  });
}

/**
 * Get the list of choice options from a Choice type.
 */
export function getOptions(choice: Choice): ChoiceOption[] {
  return choice.attributes;
}

/**
 * Get conditions that are defined on the Data types within a Choice's options.
 * Since Choice options reference type calls, we return the conditions
 * from the parent Choice's enclosing Data types (if any).
 */
export function getEffectiveConditions(choice: Choice): Condition[] {
  // Choice types in Rune DSL don't directly contain conditions;
  // conditions live on the Data types referenced by ChoiceOption.
  // This utility collects them for convenience.
  const conditions: Condition[] = [];
  for (const option of choice.attributes) {
    const typeRef = option.typeCall?.type?.ref;
    if (typeRef && '$type' in typeRef && typeRef.$type === 'Data') {
      const data = typeRef as { conditions?: Condition[] };
      if (data.conditions) {
        conditions.push(...data.conditions);
      }
    }
  }
  return conditions;
}
