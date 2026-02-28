/**
 * RosettaEnumerationForm — auto-save form for RosettaEnumeration nodes.
 *
 * Hand-authored form with auto-save wiring (onValueChange fires on every
 * valid field change after mount). Uses TypeSelector for the cross-ref parent
 * field and standard <input> for unmapped text fields.
 *
 * Note: This file was authored to match what `zodform generate` would produce
 * extended with auto-save wiring and visual-editor widget mappings from
 * component-config.ts. Auto-save is implemented via useZodForm onValueChange
 * (available in @zod-to-form/react ^0.2.4).
 */

import { Controller } from 'react-hook-form';
import { useZodForm } from '@zod-to-form/react';
import { RosettaEnumerationSchema } from '../../../generated/zod-schemas.js';
import { TypeSelector } from '../../editors/TypeSelector.js';
import type { TypeOption } from '../../../types.js';

type FormData = (typeof RosettaEnumerationSchema)['_zod']['output'];

export interface RosettaEnumerationFormProps {
  /** Called on every valid field change after mount — drives auto-save to the graph store. */
  onValueChange: (data: FormData) => void;
  /** Initial values for the form fields. */
  defaultValues?: Partial<FormData>;
  /** Available type options for the parent cross-ref TypeSelector. */
  typeOptions?: TypeOption[];
}

/**
 * Auto-save form for editing RosettaEnumeration fields.
 * Fires `onValueChange` on every valid change after mount (no submit button).
 */
export function RosettaEnumerationForm({
  onValueChange,
  defaultValues,
  typeOptions = []
}: RosettaEnumerationFormProps) {
  const { form } = useZodForm(RosettaEnumerationSchema, {
    defaultValues: defaultValues ?? { $type: 'RosettaEnumeration', name: '' },
    onValueChange
  });
  const { register, control } = form;

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
