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
import { ChoiceSchema } from '../../../generated/zod-schemas.js';

type FormData = StripIndexSignature<z.output<typeof ChoiceSchema>>;

export function ChoiceForm(props: {
  onValueChange?: (data: FormData) => void;
  onSubmit?: (data: FormData) => void;
  defaultValues?: Partial<FormData>;
  values?: FormData;
}) {
  const form = useForm<FormData>({
    resolver: zodResolver(ChoiceSchema),
    mode: 'onChange',
    defaultValues: props.defaultValues,
    values: props.values
  });
  const { register, watch, control } = form;
  const {
    fields: attributesFields,
    append: appendAttributes,
    remove: removeAttributes
  } = useFieldArray<FormData, 'attributes'>({ control, name: 'attributes' });
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
        <div>
          <label>Attributes</label>
          {attributesFields.map((item, index) => (
            <div key={item.id}>
              <div>
                <label>0</label>
                <fieldset>
                  <legend>0</legend>
                  <div>
                    <label>Type Call</label>
                    <fieldset>
                      <legend>Type Call</legend>
                      <Field>
                        <FieldLabel htmlFor="attributes.${index}.typeCall.type">Type</FieldLabel>
                        <FieldControl>
                          <Controller
                            name={`attributes.${index}.typeCall.type`}
                            control={control}
                            render={({ field }) => (
                              <TypeSelector
                                id={`attributes.${index}.typeCall.type`}
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
                    </fieldset>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="attributes.${index}.definition">Definition</FieldLabel>
                    <FieldControl>
                      <Textarea
                        id="attributes.${index}.definition"
                        {...register(`attributes.${index}.definition`)}
                        rows={2}
                      />
                    </FieldControl>
                  </Field>
                </fieldset>
              </div>
              <button type="button" onClick={() => removeAttributes(index)}>
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              appendAttributes({
                $type: 'ChoiceOption',
                typeCall: { $type: 'TypeCall', type: { $refText: '', ref: '' }, arguments: [] },
                definition: '',
                references: [],
                annotations: [],
                synonyms: [],
                labels: [],
                ruleReferences: []
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
