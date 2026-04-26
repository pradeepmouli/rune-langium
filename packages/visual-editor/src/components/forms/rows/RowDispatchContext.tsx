// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * RowDispatchContext — bridges custom row renderers (Phase 8 / US6) to
 * the host editor's per-row callbacks.
 *
 * The four registered row renderers (`AttributeRow`, `ChoiceOptionRow`,
 * `EnumValueRow`, `FunctionInputRow`) need per-row props that depend on
 * editor-instance state (`nodeId`, `actions`, `availableTypes`,
 * navigation callbacks, committed-name diff anchors). Those values
 * cannot live on the static `formRegistry` registration because the
 * registration is module-scoped while the values change per form mount.
 *
 * The host wraps `<ZodForm>` (or the manual `.map()` body, which still
 * renders the same row components today) with `<RowDispatchProvider>`,
 * supplying a "slot" per row kind it cares about. Each slot is a
 * function `(field) => props` that the registered renderer invokes with
 * the matched array-item `FormField`. Forms only populate the slots they
 * use — DataTypeForm provides `attribute`, ChoiceForm provides
 * `choiceOption`, EnumForm provides `enumValue`, FunctionForm provides
 * `functionInput`.
 *
 * @module
 */

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { FormField } from '@zod-to-form/core';
import type { AttributeRowProps } from '../../editors/AttributeRow.js';
import type { ChoiceOptionRowProps } from '../../editors/ChoiceOptionRow.js';
import type { EnumValueRowProps } from '../../editors/EnumValueRow.js';
import type { FunctionInputRowProps } from '../../editors/FunctionInputRow.js';

// ---------------------------------------------------------------------------
// Slot prop shapes — the row's full prop set minus the index/path-derived
// fields that the renderer fills in from `field.key`
// ---------------------------------------------------------------------------

export type AttributeRowDispatch = Omit<AttributeRowProps, 'index'>;
export type ChoiceOptionRowDispatch = ChoiceOptionRowProps;
export type EnumValueRowDispatch = Omit<EnumValueRowProps, 'index'>;
export type FunctionInputRowDispatch = FunctionInputRowProps;

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

/**
 * Per-row slot signature: given the matched `FormField`, return the props
 * the row component should receive (sans `index`, which the renderer
 * derives from `field.key`).
 */
export type RowDispatchSlot<TProps> = (field: FormField) => TProps;

/**
 * The complete set of dispatch slots a host editor MAY surface. Hosts only
 * populate the slots they actually use; absent slots cause the registered
 * renderer to no-op (so adopters can opt in incrementally).
 */
export interface RowDispatchContextValue {
  attribute?: RowDispatchSlot<AttributeRowDispatch>;
  choiceOption?: RowDispatchSlot<ChoiceOptionRowDispatch>;
  enumValue?: RowDispatchSlot<EnumValueRowDispatch>;
  functionInput?: RowDispatchSlot<FunctionInputRowDispatch>;
}

const RowDispatchContext = createContext<RowDispatchContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider + hook
// ---------------------------------------------------------------------------

export interface RowDispatchProviderProps extends RowDispatchContextValue {
  children: ReactNode;
}

/**
 * Surface per-row dispatch slots to the registered row renderers below.
 * Wrap the host editor's form body so `formRegistry`-driven renderers
 * (and the existing `.map()` rows during the Phase-8 transition) can pull
 * their props.
 */
export function RowDispatchProvider({ children, ...value }: RowDispatchProviderProps): ReactNode {
  return <RowDispatchContext.Provider value={value}>{children}</RowDispatchContext.Provider>;
}

/**
 * Read the row dispatch context. Returns `null` outside a provider so
 * registered renderers can no-op rather than throw — see row-renderer
 * contract §7 (failure modes).
 */
export function useRowDispatchContext(): RowDispatchContextValue | null {
  return useContext(RowDispatchContext);
}
