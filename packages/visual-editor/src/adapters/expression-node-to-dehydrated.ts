// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * expression-node-to-dehydrated — Convert the expression builder's
 * ExpressionNode IR to a renderExpression-ready tree.
 *
 * Inverse of ast-to-expression-node: string refs become `{$refText}`; the
 * synthetic `id` is dropped (renderExpression ignores extra fields, so ids
 * are simply not copied); the two UI-only variants map to the RawDsl leaf:
 *   Placeholder  → { $type: 'RawDsl', text: '___' } (preview only — throws otherwise)
 *   Unsupported  → { $type: 'RawDsl', text: rawText }
 *
 * REF_FIELDS/REF_ARRAY_FIELDS are the inverse of ast-to-expression-node.ts's
 * resolveRef call sites (symbol, feature, enumeration, key, referenceGuard,
 * and the attributes array) — cross-checked field-for-field against that file.
 */

import { RAW_DSL_TYPE } from '@rune-langium/codegen/rosetta';
import type { ExpressionNode } from '../schemas/expression-node-schema.js';

const PLACEHOLDER_MARKER = '___';

/** Fields that hold a string ref in ExpressionNode but {$refText} in the AST. */
const REF_FIELDS = new Set(['symbol', 'feature', 'enumeration', 'key', 'referenceGuard']);
/** Array fields whose ELEMENTS are string refs. */
const REF_ARRAY_FIELDS = new Set(['attributes']);
/** UI-only fields to drop. */
const DROP_FIELDS = new Set(['id']);

export interface ToDehydratedOptions {
  allowPlaceholders: boolean;
}

export function expressionNodeToDehydrated(node: ExpressionNode, opts: ToDehydratedOptions): unknown {
  return convert(node as unknown as Record<string, unknown>, opts);
}

function convert(value: unknown, opts: ToDehydratedOptions): unknown {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => convert(v, opts));

  const obj = value as Record<string, unknown>;
  const $type = obj['$type'] as string | undefined;

  if ($type === 'Placeholder') {
    if (!opts.allowPlaceholders) throw new Error('Cannot serialize expression containing placeholders');
    return { $type: RAW_DSL_TYPE, text: PLACEHOLDER_MARKER };
  }
  if ($type === 'Unsupported') {
    return { $type: RAW_DSL_TYPE, text: String(obj['rawText'] ?? '') };
  }

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(obj)) {
    if (DROP_FIELDS.has(key)) continue;
    if (REF_FIELDS.has(key) && typeof v === 'string') {
      out[key] = { $refText: v };
    } else if (REF_ARRAY_FIELDS.has(key) && Array.isArray(v)) {
      out[key] = v.map((item) => (typeof item === 'string' ? { $refText: item } : convert(item, opts)));
    } else if (key === 'literalGuard' && v != null && typeof v !== 'object') {
      // SwitchCaseGuard.literalGuard is grammar-typed as RosettaLiteral (an
      // object), but defend against a bare primitive the way the old
      // serializer's String()-fallback did — renderSwitchCase's dispatch()
      // would otherwise throw on a $type-less value.
      out[key] = { $type: RAW_DSL_TYPE, text: String(v) };
    } else {
      out[key] = convert(v, opts);
    }
  }
  return out;
}
