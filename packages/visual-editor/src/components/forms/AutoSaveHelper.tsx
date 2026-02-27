/**
 * AutoSaveHelper — renders null; bridges ZodForm's FormProvider context
 * with useAutoSave so that any form value change triggers a debounced commit.
 *
 * Intended to be placed as a child of <ZodForm>:
 *
 *   <ZodForm schema={...} onSubmit={() => {}}>
 *     <AutoSaveHelper onCommit={(values) => save(values)} />
 *   </ZodForm>
 *
 * @module
 */

import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { useAutoSave } from '../../hooks/useAutoSave.js';

interface AutoSaveHelperProps<T> {
  /** Called with the latest form values after `delay` ms of inactivity. */
  onCommit: (values: Partial<T>) => void;
  /** Debounce delay in milliseconds. Defaults to 500. */
  delay?: number;
}

export function AutoSaveHelper<T>({ onCommit, delay = 500 }: AutoSaveHelperProps<T>) {
  const form = useFormContext<T>();
  const save = useAutoSave(onCommit, delay);

  useEffect(() => {
    const { unsubscribe } = form.watch((values) => save(values as Partial<T>));
    return unsubscribe;
  }, [form, save]);

  return null;
}
