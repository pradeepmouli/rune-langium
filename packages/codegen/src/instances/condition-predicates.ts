// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { Data } from '@rune-langium/core';
import { activeConditions, buildConditionTranspilerContext } from '../emit/base-namespace-emitter.js';
import { transpileCondition } from '../expr/transpiler.js';

export interface ConditionPredicate {
  name: string;
  predicate: string;
}

/**
 * Extract each active condition on `data` as a plain JS boolean-predicate
 * string referencing `data` — the same string `emitConditionBlock` embeds
 * into `.refine((data) => <predicate>, ...)`, but returned standalone so
 * the studio's instance validator can execute it directly.
 */
export function getActiveConditionPredicates(data: Data): ConditionPredicate[] {
  return activeConditions(data).map((cond) => {
    const name = cond.name ?? 'Condition';
    const ctx = buildConditionTranspilerContext(data, 'zod-refine', name, []);
    return { name, predicate: transpileCondition(cond, ctx) };
  });
}
