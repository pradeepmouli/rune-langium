// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { useEffect } from 'react';
import { useForm, useFieldArray, Controller, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { StripIndexSignature } from '@zod-to-form/core';
import {
  CardinalitySelector,
  Field,
  FieldControl,
  FieldLabel,
  Input,
  Select,
  TypeSelector
} from '@/components/zod-form-components';
import { RosettaFunctionSchema } from '../../../generated/zod-schemas.js';

type FormData = StripIndexSignature<z.output<typeof RosettaFunctionSchema>>;

export function RosettaFunctionForm(props: {
  onValueChange?: (data: FormData) => void;
  onSubmit?: (data: FormData) => void;
  defaultValues?: Partial<FormData>;
  values?: FormData;
}) {
  const form = useForm<FormData>({
    resolver: zodResolver(RosettaFunctionSchema),
    mode: 'onChange',
    defaultValues: props.defaultValues,
    values: props.values
  });
  const { register, watch, control } = form;
  const {
    fields: inputsFields,
    append: appendInputs,
    remove: removeInputs
  } = useFieldArray<FormData, 'inputs'>({ control, name: 'inputs' });
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
          <label>Inputs</label>
          {inputsFields.map((item, index) => (
            <div key={item.id}>
              <div>
                <label>0</label>
                <fieldset>
                  <legend>0</legend>
                  <Field>
                    <FieldLabel htmlFor="inputs.${index}.name">Name</FieldLabel>
                    <FieldControl>
                      <Input id="inputs.${index}.name" {...register(`inputs.${index}.name`)} />
                    </FieldControl>
                  </Field>
                  <div>
                    <label>Type Call</label>
                    <fieldset>
                      <legend>Type Call</legend>
                      <Field>
                        <FieldLabel htmlFor="inputs.${index}.typeCall.type">Type</FieldLabel>
                        <FieldControl>
                          <Controller
                            name={`inputs.${index}.typeCall.type`}
                            control={control}
                            render={({ field }) => (
                              <TypeSelector
                                id={`inputs.${index}.typeCall.type`}
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
                    <FieldLabel htmlFor="inputs.${index}.card">Card</FieldLabel>
                    <FieldControl>
                      <Controller
                        name={`inputs.${index}.card`}
                        control={control}
                        render={({ field }) => (
                          <CardinalitySelector
                            id={`inputs.${index}.card`}
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
              <button type="button" onClick={() => removeInputs(index)}>
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              appendInputs({
                $type: 'Attribute',
                name: '',
                typeCall: { $type: 'TypeCall', type: { $refText: '', ref: '' }, arguments: [] },
                card: { $type: 'RosettaCardinality', inf: 0, sup: 0, unbounded: false }
              })
            }
          >
            Add
          </button>
        </div>
        <div>
          <label>Output</label>
          <fieldset>
            <legend>Output</legend>
            <Field>
              <FieldLabel htmlFor="output.typeCall">Type Call</FieldLabel>
              <FieldControl>
                <Controller
                  name={'output.typeCall'}
                  control={control}
                  render={({ field }) => (
                    <TypeSelector
                      id="output.typeCall"
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
            <Field>
              <FieldLabel htmlFor="output.card">Card</FieldLabel>
              <FieldControl>
                <Controller
                  name={'output.card'}
                  control={control}
                  render={({ field }) => (
                    <CardinalitySelector
                      id="output.card"
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
      </form>
    </FormProvider>
  );
}
