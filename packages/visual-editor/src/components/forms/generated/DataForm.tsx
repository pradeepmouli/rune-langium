/**
 * DataForm — auto-save form for Data type nodes.
 *
 * Hand-authored form with auto-save wiring (onValueChange fires on every
 * valid field change after mount). Uses TypeSelector for the cross-ref superType
 * field and standard <input> for unmapped text fields.
 *
 * Note: This file was authored to match what `zodform generate` would produce
 * extended with auto-save wiring and visual-editor widget mappings from
 * component-config.ts. Auto-save is implemented via useZodForm onValueChange
 * (available in @zod-to-form/react ^0.2.4).
 */

import { Controller } from 'react-hook-form';
import { useZodForm } from '@zod-to-form/react';
import { DataSchema } from '../../../generated/zod-schemas.js';
import { TypeSelector } from '../../editors/TypeSelector.js';
import type { TypeOption } from '../../../types.js';

type FormData = (typeof DataSchema)['_zod']['output'];

export interface DataFormProps {
  /** Called on every valid field change after mount — drives auto-save to the graph store. */
  onValueChange: (data: FormData) => void;
  /** Initial values for the form fields. */
  defaultValues?: Partial<FormData>;
  /** Available type options for the superType cross-ref TypeSelector. */
  typeOptions?: TypeOption[];
}

/**
 * Auto-save form for editing Data type fields.
 * Fires `onValueChange` on every valid change after mount (no submit button).
 */
export function DataForm({ onValueChange, defaultValues, typeOptions = [] }: DataFormProps) {
  const { form } = useZodForm(DataSchema, {
    defaultValues: defaultValues ?? { $type: 'Data', name: '' },
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

      {/* superType — cross-ref field: TypeSelector widget */}
      <div>
        <label>Super Type</label>
        <Controller
          control={control}
          name="superType"
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
