// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { useEffect } from 'react';
import { useForm, useFieldArray, Controller, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { StripIndexSignature } from '@zod-to-form/core';
import {
  Field,
  FieldControl,
  FieldLabel,
  Input,
  Textarea,
  TypeSelector
} from '@/components/zod-form-components';
import { RosettaEnumerationSchema } from '../../../generated/zod-schemas.js';

type FormData = StripIndexSignature<z.output<typeof RosettaEnumerationSchema>>;

export function RosettaEnumerationForm(props: {
  onValueChange?: (data: FormData) => void;
  onSubmit?: (data: FormData) => void;
  defaultValues?: Partial<FormData>;
  values?: FormData;
}) {
  const form = useForm<FormData>({
    resolver: zodResolver(RosettaEnumerationSchema),
    mode: 'onChange',
    defaultValues: props.defaultValues,
    values: props.values
  });
  const { register, watch, control } = form;
  const {
    fields: enumValuesFields,
    append: appendEnumValues,
    remove: removeEnumValues
  } = useFieldArray<FormData, 'enumValues'>({ control, name: 'enumValues' });
  useEffect(() => {
    const subscription = watch((values) => {
      props.onValueChange?.(values as FormData);
    });

    return () => subscription.unsubscribe();
  }, [watch, props.onValueChange]);

  return (
    <FormProvider {...form}>
      <form>
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <FieldControl>
            <Input id="name" {...register('name')} />
          </FieldControl>
        </Field>
        <Field>
          <FieldLabel htmlFor="parent">Parent</FieldLabel>
          <FieldControl>
            <Controller
              name={'parent'}
              control={control}
              render={({ field }) => (
                <TypeSelector
                  id="parent"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  name={field.name}
                />
              )}
            />
          </FieldControl>
        </Field>
        <div>
          <label>Enum Values</label>
          {enumValuesFields.map((item, index) => (
            <div key={item.id}>
              <div>
                <label>0</label>
                <fieldset>
                  <legend>0</legend>
                  <Field>
                    <FieldLabel htmlFor="enumValues.${index}.name">Name</FieldLabel>
                    <FieldControl>
                      <Input
                        id="enumValues.${index}.name"
                        {...register(`enumValues.${index}.name`)}
                      />
                    </FieldControl>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="enumValues.${index}.display">Display</FieldLabel>
                    <FieldControl>
                      <Input
                        id="enumValues.${index}.display"
                        {...register(`enumValues.${index}.display`)}
                      />
                    </FieldControl>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="enumValues.${index}.definition">Definition</FieldLabel>
                    <FieldControl>
                      <Textarea
                        id="enumValues.${index}.definition"
                        {...register(`enumValues.${index}.definition`)}
                        rows={2}
                      />
                    </FieldControl>
                  </Field>
                </fieldset>
              </div>
              <button type="button" onClick={() => removeEnumValues(index)}>
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              appendEnumValues({
                $type: 'RosettaEnumValue',
                name: '',
                display: '',
                definition: '',
                references: [],
                annotations: [],
                enumSynonyms: []
              })
            }
          >
            Add
          </button>
        </div>
      </form>
    </FormProvider>
  );
}
