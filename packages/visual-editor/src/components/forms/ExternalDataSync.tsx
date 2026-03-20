// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * ExternalDataSync — synchronises external data prop changes into a
 * react-hook-form FormProvider context (T033).
 *
 * Renders null. When mounted inside a <FormProvider>, watches the `data`
 * reference for changes and calls `form.reset(toValues(), { keepDirtyValues: true })`
 * so that external updates (undo/redo, graph store pushes) are reflected in
 * pristine fields without overwriting in-progress user edits (FR-016).
 *
 * Usage:
 *   <FormProvider {...form}>
 *     <ExternalDataSync data={nodeData} toValues={() => toFormValues(nodeData)} />
 *     {... rest of form JSX ...}
 *   </FormProvider>
 *
 * @module
 */

import { useEffect, useRef } from 'react';
import { useFormContext } from 'react-hook-form';
import type { FieldValues } from 'react-hook-form';

export interface ExternalDataSyncProps<T extends FieldValues> {
  /** Opaque external data reference — identity change triggers a reset. */
  data: unknown;
  /**
   * Derives the new form values from the current external data.
   * Called only when `data` reference changes, so it is safe to use
   * an inline arrow function (the ref is captured via `useRef`).
   */
  toValues: () => T;
}

/**
 * Synchronises an external data reference into the surrounding FormProvider.
 *
 * Only resets when `data` object identity changes (strict `!==` check),
 * so rapid re-renders with the same data object are a no-op. Dirty fields
 * are preserved thanks to `{ keepDirtyValues: true }`.
 */
export function ExternalDataSync<T extends FieldValues>({
  data,
  toValues
}: ExternalDataSyncProps<T>): null {
  const form = useFormContext<T>();

  // Keep toValues up-to-date without triggering the effect
  const toValuesRef = useRef(toValues);
  toValuesRef.current = toValues;

  // Track the previous data reference so we can skip the initial mount
  const prevDataRef = useRef(data);

  useEffect(() => {
    if (prevDataRef.current !== data) {
      prevDataRef.current = data;
      form.reset(toValuesRef.current(), { keepDirtyValues: true });
    }
  }, [data, form]);

  return null;
}
