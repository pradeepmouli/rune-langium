// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { AstNodeShape, AstNodeModel } from '../types.js';

/**
 * Runtime-only AST fields that should never reach the client/editor model.
 *
 * This keeps the AST-shaped payload intact while stripping Langium internals
 * and eagerly-resolved reference targets that can introduce cycles.
 */
const STRIPPED_AST_FIELDS = new Set([
  '$container',
  '$containerProperty',
  '$containerIndex',
  '$cstNode',
  '$document',
  '$refNode',
  '$nodeDescription',
  'references',
  'labels',
  'ruleReferences',
  'typeCallArgs',
  'enumSynonyms',
  'ref',
  'error'
]);

function stripValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    const existing = seen.get(value);
    if (existing) {
      return existing;
    }

    const stripped: unknown[] = [];
    seen.set(value, stripped);
    for (const item of value) {
      stripped.push(stripValue(item, seen));
    }
    return stripped;
  }

  const existing = seen.get(value);
  if (existing) {
    return existing;
  }

  const stripped: Record<string, unknown> = {};
  seen.set(value, stripped);

  for (const [key, entry] of Object.entries(value)) {
    if (STRIPPED_AST_FIELDS.has(key) || key.startsWith('_')) {
      continue;
    }
    stripped[key] = stripValue(entry, seen);
  }

  return stripped;
}

/**
 * Strip Langium/runtime-only fields from an AST-shaped object without
 * reshaping it into a bespoke projection.
 */
export function stripAdditionalAstFields<T extends AstNodeShape>(value: T): AstNodeModel<T>;
export function stripAdditionalAstFields<T>(value: T): T;
export function stripAdditionalAstFields<T>(value: T): T {
  return stripValue(value, new WeakMap<object, unknown>()) as T;
}
