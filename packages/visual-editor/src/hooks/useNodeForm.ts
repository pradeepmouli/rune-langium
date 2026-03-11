/**
 * useNodeForm — generic hook that wires react-hook-form to graph node data.
 *
 * Creates a `UseFormReturn<T>` with zodResolver validation, syncs from
 * node-data props via `form.reset()`, and provides a `useFieldArray`
 * handle for the `members` array.
 *
 * Forms call `useNodeForm(schema, data)` and get back a form + members
 * field-array ready for `FormProvider` + `useFormContext` in children.
 *
 * @module
 */

import { useEffect, useMemo, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { UseFormReturn, UseFieldArrayReturn, FieldValues, ArrayPath } from 'react-hook-form';
import type { z } from 'zod';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseNodeFormOptions<T extends FieldValues> {
  /** Zod schema for the entire form shape. */
  schema: z.ZodType<T>;
  /** Function that derives default values from the current node data. */
  defaultValues: () => T;
  /**
   * Serialised key that changes when external data should reset the form.
   * Typically `JSON.stringify(defaultValues())` or a composite of stable
   * identifiers (nodeId, data.name, etc.).
   */
  resetKey: string;
}

export interface UseNodeFormReturn<T extends FieldValues> {
  /** The full react-hook-form return (pass to FormProvider). */
  form: UseFormReturn<T>;
  /** Field-array helpers for the `members` path. */
  members: UseFieldArrayReturn<T, ArrayPath<T>>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Creates a react-hook-form instance backed by a Zod schema, with
 * automatic reset when external data changes and a `useFieldArray`
 * for the `members` path.
 */
export function useNodeForm<T extends FieldValues>({
  schema,
  defaultValues,
  resetKey
}: UseNodeFormOptions<T>): UseNodeFormReturn<T> {
  // Memoize default values so react-hook-form doesn't re-render needlessly
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const defaults = useMemo(() => defaultValues(), [resetKey]);

  const form = useForm<T>({
    resolver: zodResolver(schema as any),
    defaultValues: defaults as any,
    mode: 'onChange'
  });

  // Track previous resetKey to avoid resetting on mount
  const prevResetKeyRef = useRef(resetKey);

  useEffect(() => {
    if (prevResetKeyRef.current !== resetKey) {
      prevResetKeyRef.current = resetKey;
      // keepDirtyValues preserves in-flight user edits while applying
      // external changes (undo/redo, graph confirmations). Node-switching
      // should be handled via key= prop on the form component to force
      // a full remount with fresh defaultValues.
      form.reset(defaults as any, { keepDirtyValues: true });
    }
  }, [resetKey, defaults, form]);

  const members = useFieldArray<T, ArrayPath<T>>({
    control: form.control,
    name: 'members' as ArrayPath<T>
  });

  return { form, members };
}
