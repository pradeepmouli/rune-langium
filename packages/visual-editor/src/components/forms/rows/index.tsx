// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Row renderer registrations (Phase 8 / User Story 6 — T056).
 *
 * Registers each inline row component (`AttributeRow`, `ChoiceOptionRow`,
 * `EnumValueRow`, `FunctionInputRow`) as a `FormMeta.render` override
 * against its item AST schema, per
 * `specs/013-z2f-editor-migration/contracts/row-renderer.md` and the
 * upstream `@zod-to-form/core` worked example
 * (`apps/docs/docs/editor-primitives/custom-row-renderer.md`, v0.8.0).
 *
 * Each render function receives the `FormField` for an array item; the
 * `field.key` is the per-row path (e.g. `"attributes.0"` for the Data
 * form's AST-shaped `attributes[]`, `"choiceOptions.0"` for choices, etc.).
 * The renderer reads sibling form values via `useFormContext` and pulls
 * per-row callbacks from `RowDispatchContext`, which the host editor
 * provides via `<RowDispatchProvider>` so the rows stay decoupled from the
 * kind-specific `EditorFormActions` shape.
 *
 * Two registries are exported:
 *
 *   - `formRegistry` — baseline mapping for forms whose `AttributeSchema`
 *     items are Data-style attributes (DataTypeForm, ChoiceForm, EnumForm).
 *   - `functionFormRegistry` — overrides `AttributeSchema` to the
 *     function-input renderer, since function `inputs[]` reuse
 *     `AttributeSchema` per `generated/zod-schemas.ts:640`.
 *
 * The four registrations share a single helper (`makeRowRender`) so the
 * file stays DRY when more row kinds are added.
 *
 * @module
 */

import { z } from 'zod';
import type { FormMeta, ZodFormRegistry, FormField } from '@zod-to-form/core';
import type { $replace } from 'zod/v4/core';

import { AttributeRow } from '../../editors/AttributeRow.js';
import { ChoiceOptionRow } from '../../editors/ChoiceOptionRow.js';
import { EnumValueRow } from '../../editors/EnumValueRow.js';
import { FunctionInputRow } from '../../editors/FunctionInputRow.js';
import {
  AttributeSchema,
  ChoiceOptionSchema,
  RosettaEnumValueSchema
} from '../../../generated/zod-schemas.js';
import {
  useRowDispatchContext,
  type RowDispatchContextValue,
  type AttributeRowDispatch,
  type ChoiceOptionRowDispatch,
  type EnumValueRowDispatch,
  type FunctionInputRowDispatch
} from './RowDispatchContext.js';
import type { ReactElement } from 'react';

// ---------------------------------------------------------------------------
// Helper — derive the row index from the field's key
// ---------------------------------------------------------------------------

/**
 * Extract the trailing array index from a FormField key.
 *
 * `field.key` for an array item is shaped like `"attributes.0"` or
 * `"enumValues.2"`; the last segment is the row's positional index. Falls
 * back to `0` if the key has no trailing index — defensive only; the
 * walker only invokes `render` for matched array items.
 */
function indexFromKey(field: FormField): number {
  const parts = field.key.split('.');
  const last = parts[parts.length - 1];
  const n = Number(last);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Render-function factory — DRY shell shared by every row registration
// ---------------------------------------------------------------------------

type RowKind = keyof RowKindMap;

/**
 * Mapping from row kind → the props the host editor must supply per row
 * (sans `index`, which is derived from the field key). The host editor
 * builds one of these per row via the dispatch context.
 */
export interface RowKindMap {
  attribute: AttributeRowDispatch;
  choiceOption: ChoiceOptionRowDispatch;
  enumValue: EnumValueRowDispatch;
  functionInput: FunctionInputRowDispatch;
}

type RowComponent<K extends RowKind> = (
  props: K extends 'attribute' | 'enumValue' ? RowKindMap[K] & { index: number } : RowKindMap[K]
) => ReactElement | null;

/**
 * Build a `FormMeta.render` function that delegates to a per-row React
 * component. The wrapper looks up the host-provided dispatch via
 * `useRowDispatchContext()` and forwards the trailing array index
 * derived from `field.key`.
 *
 * Keeping this as a single helper means each new row kind is one extra
 * `formRegistry.add(...)` line plus one factory call, rather than four
 * near-copies of the same plumbing.
 */
function makeRowRender<K extends RowKind>(
  kind: K,
  Component: RowComponent<K>
): NonNullable<FormMeta['render']> {
  function RowRender(field: FormField): ReactElement | null {
    const dispatch = useRowDispatchContext();
    const slot = dispatch?.[kind];
    if (!slot) {
      // No dispatch surfaced — render nothing. Adopters using the
      // registry without the host wiring continue to see their existing
      // `.map()` rows; this keeps the registration safe to land before
      // the per-form host wiring is in place.
      return null;
    }
    const props = slot(field) as RowKindMap[K];
    if (kind === 'attribute' || kind === 'enumValue') {
      const withIndex = { ...props, index: indexFromKey(field) } as Parameters<RowComponent<K>>[0];
      return Component(withIndex);
    }
    return Component(props as Parameters<RowComponent<K>>[0]);
  }
  (RowRender as unknown as { displayName?: string }).displayName = `${kind}Render`;
  return RowRender as NonNullable<FormMeta['render']>;
}

// ---------------------------------------------------------------------------
// Render-function exports — also referenced directly by the test suite to
// confirm registration identity
// ---------------------------------------------------------------------------

export const AttributeRowRender = makeRowRender('attribute', AttributeRow);
export const ChoiceOptionRowRender = makeRowRender('choiceOption', ChoiceOptionRow);
export const EnumValueRowRender = makeRowRender('enumValue', EnumValueRow);
export const FunctionInputRowRender = makeRowRender('functionInput', FunctionInputRow);

// ---------------------------------------------------------------------------
// Registries — a baseline registry for Data/Choice/Enum forms plus a
// derived `functionFormRegistry` that overrides `AttributeSchema` to the
// function-input renderer
// ---------------------------------------------------------------------------

export const formRegistry: ZodFormRegistry = z.registry<FormMeta>();

// The registry's `add()` is parameterised by zod's `$replace<Meta, Schema>`
// helper, which recursively walks `FormMeta`'s structural shape and
// substitutes `$output` / `$input` symbols. The walk descends into nested
// `FormField`/`$ZodType` types and emits a type-equivalent but
// structurally-distinct shape; TypeScript then refuses to unify
// `(field: FormField, props) => …` with the walked variant. Cast through
// `$replace<FormMeta, S>` exactly as upstream `register.ts` does — the
// runtime contract is unchanged.
formRegistry.add(AttributeSchema, { render: AttributeRowRender } as $replace<
  FormMeta,
  typeof AttributeSchema
>);
formRegistry.add(ChoiceOptionSchema, { render: ChoiceOptionRowRender } as $replace<
  FormMeta,
  typeof ChoiceOptionSchema
>);
formRegistry.add(RosettaEnumValueSchema, { render: EnumValueRowRender } as $replace<
  FormMeta,
  typeof RosettaEnumValueSchema
>);

/**
 * Function-form registry. Function `inputs[]` reuse `AttributeSchema`
 * (see `generated/zod-schemas.ts:640`), so the function form needs an
 * `AttributeSchema → FunctionInputRowRender` mapping that diverges from
 * the Data form's mapping. We expose a separate registry rather than
 * mutating the shared one, so each form passes the registry it owns into
 * `useZodForm({ formRegistry })` (the one-line addition called out in
 * the Phase-8 task plan).
 */
export const functionFormRegistry: ZodFormRegistry = z.registry<FormMeta>();
functionFormRegistry.add(AttributeSchema, { render: FunctionInputRowRender } as $replace<
  FormMeta,
  typeof AttributeSchema
>);
functionFormRegistry.add(ChoiceOptionSchema, { render: ChoiceOptionRowRender } as $replace<
  FormMeta,
  typeof ChoiceOptionSchema
>);
functionFormRegistry.add(RosettaEnumValueSchema, { render: EnumValueRowRender } as $replace<
  FormMeta,
  typeof RosettaEnumValueSchema
>);

export { RowDispatchProvider, useRowDispatchContext } from './RowDispatchContext.js';
export type {
  RowDispatchContextValue,
  AttributeRowDispatch,
  ChoiceOptionRowDispatch,
  EnumValueRowDispatch,
  FunctionInputRowDispatch
} from './RowDispatchContext.js';
