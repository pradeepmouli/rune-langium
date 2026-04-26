// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Schema barrel for the visual editor.
 *
 * Per R1 / R11 of `specs/013-z2f-editor-migration/research.md`, editor
 * forms drive validation off the langium-generated AST schemas in
 * `src/generated/zod-schemas.ts` directly. Only schemas that describe
 * non-AST surfaces (expression-node renderers, UI derivation) live here.
 *
 * @module
 */

export { deriveUiSchema, type DeriveOptions } from './derive-ui-schema.js';
export {
  ExpressionNodeSchema,
  PlaceholderNodeSchema,
  UnsupportedNodeSchema,
  type ExpressionNode,
  type ExpressionNodeType
} from './expression-node-schema.js';
