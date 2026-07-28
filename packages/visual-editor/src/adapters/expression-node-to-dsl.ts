// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * expression-node-to-dsl — Serialize an ExpressionNode tree to Rune DSL text.
 *
 * Thin wrapper: converts the builder IR via expressionNodeToDehydrated, then
 * delegates to the shared structural renderer (@rune-langium/codegen/rosetta
 * renderExpression) — the same renderer used by render-core serialization.
 */

import { renderExpression } from '@rune-langium/codegen/rosetta';
import type { ExpressionNode } from '../schemas/expression-node-schema.js';
import { expressionNodeToDehydrated } from './expression-node-to-dehydrated.js';

/** Serialize an ExpressionNode tree to Rune DSL text. Throws on placeholders. */
export function expressionNodeToDsl(tree: ExpressionNode): string {
  return renderExpression(expressionNodeToDehydrated(tree, { allowPlaceholders: false }) as never);
}

/** Serialize with placeholders rendered as `___` (for previews). */
export function expressionNodeToDslPreview(tree: ExpressionNode): string {
  return renderExpression(expressionNodeToDehydrated(tree, { allowPlaceholders: true }) as never);
}
