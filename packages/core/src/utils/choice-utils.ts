import type { Choice, ChoiceOption, Condition } from '../generated/ast.js';

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
