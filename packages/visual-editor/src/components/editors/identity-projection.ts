// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Identity projection helpers shared by every top-level editor form.
 *
 * Per R11 of `specs/013-z2f-editor-migration/research.md`, editors consume
 * the AST graph node directly: the AST schemas (`DataSchema`,
 * `ChoiceSchema`, `RosettaEnumerationSchema`, `RosettaFunctionSchema`,
 * `RosettaTypeAliasSchema`) are all `z.looseObject`, so the graph node
 * passes through `defaultValues` and `useExternalSync` unchanged. There
 * is no projection layer — the helper exists only to thread the typed
 * gap between `AnyGraphNode` (a discriminated union) and z2f's
 * parameterised `Partial<output<Schema>>` constraint.
 *
 * Each editor narrows by `$type` upstream (in `EditorFormPanel`'s
 * dispatch), so the cast is safe at every call site.
 *
 * @module
 */

import type { z } from 'zod';
import type { ZodType } from 'zod';
import type { AnyGraphNode } from '../../types.js';

/**
 * Cast an AST graph node to a schema's inferred output shape. Used as
 * the third argument to `useExternalSync(form, data, identityProjection)`
 * and to seed `defaultValues` in `useZodForm(Schema, { defaultValues: … })`.
 */
export function identityProjection<S extends ZodType>(node: AnyGraphNode): z.output<S> {
  return node as unknown as z.output<S>;
}
