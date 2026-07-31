// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Form-values projection helper shared by every top-level editor form.
 *
 * Per R11 of `specs/013-z2f-editor-migration/research.md`, editors consume
 * the AST graph node directly: the AST schemas (`DataSchema`,
 * `ChoiceSchema`, `RosettaEnumerationSchema`, `RosettaFunctionSchema`,
 * `RosettaTypeAliasSchema`) are all `z.looseObject`, so the graph node
 * passes through `defaultValues` and `useExternalSync` largely unchanged —
 * the helper exists only to thread the typed gap between `AnyGraphNode` (a
 * discriminated union) and z2f's parameterised `Partial<output<Schema>>`
 * constraint, and to seed the UI-only `comments` field from `node.meta`.
 *
 * Each editor narrows by `$type` upstream (in `EditorFormPanel`'s
 * dispatch), so the cast is safe at every call site.
 *
 * @module
 */

import type { z } from 'zod';
import type { ZodType } from 'zod';
import type { AnyGraphNode, GraphNodeMeta } from '../../types.js';

/**
 * Meta-aware form-values projection (Phase 3 step 3). `node.data` is now the
 * pure domain payload — the UI-only `comments` annotation lives on the
 * `node.meta` sibling — but `MetadataSection` edits `comments` as a regular
 * form field. Seed it into form state from `meta` so the field round-trips:
 * meta → form default → user edit → `actions.updateComments` → meta.
 */
export function formValuesProjection<S extends ZodType>(node: AnyGraphNode, meta: GraphNodeMeta): z.output<S> {
  return { ...(node as Record<string, unknown>), comments: meta.comments } as unknown as z.output<S>;
}
