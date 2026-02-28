/**
 * RosettaEnumerationForm — auto-save form for RosettaEnumeration nodes.
 *
 * Hand-authored form with auto-save wiring (onValueChange fires on every
 * field change after mount). Uses TypeSelector for the cross-ref parent
 * field and standard <input> for unmapped text fields.
 *
 * Note: This file was authored to match what `zodform generate` would produce
 * extended with auto-save wiring and visual-editor widget mappings from
 * component-config.ts. The CLI (zodform v0.2.3) does not support --mode or
 * --component-config flags, so this form is hand-maintained.
 */

import { useEffect, useRef } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RosettaEnumerationSchema } from '../../../generated/zod-schemas.js';
import { TypeSelector } from '../../editors/TypeSelector.js';
import type { TypeOption } from '../../../types.js';

type FormData = (typeof RosettaEnumerationSchema)['_zod']['output'];

export interface RosettaEnumerationFormProps {
  /** Called on every field change after mount — drives auto-save to the graph store. */
  onValueChange: (data: FormData) => void;
  /** Initial values for the form fields. */
  defaultValues?: Partial<FormData>;
  /** Available type options for the parent cross-ref TypeSelector. */
  typeOptions?: TypeOption[];
}

/**
 * Auto-save form for editing RosettaEnumeration fields.
 * Fires `onValueChange` on every change after mount (no submit button).
 */
export function RosettaEnumerationForm({
  onValueChange,
  defaultValues,
  typeOptions = []
}: RosettaEnumerationFormProps) {
  const { register, control } = useForm<FormData>({
    resolver: zodResolver(RosettaEnumerationSchema),
    defaultValues: defaultValues ?? { $type: 'RosettaEnumeration', name: '' }
  });

  // useWatch subscribes to all field changes and triggers re-renders
  const values = useWatch({ control });

  // Skip the initial mount render — only fire onValueChange on actual user changes
  const isMounted = useRef(false);
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    onValueChange(values as unknown as FormData);
  }, [values, onValueChange]);

  return (
    <form>
      {/* name — unmapped field: standard <input> */}
      <div>
        <label htmlFor="name">Name</label>
        <input id="name" type="text" {...register('name')} />
      </div>

      {/* parent — cross-ref field: TypeSelector widget */}
      <div>
        <label>Parent</label>
        <Controller
          control={control}
          name="parent"
          render={({ field }) => (
            <TypeSelector
              value={field.value?.$refText ?? null}
              options={typeOptions}
              onSelect={(val: string | null) => field.onChange(val ? { $refText: val } : undefined)}
              allowClear
            />
          )}
        />
      </div>
    </form>
  );
}
