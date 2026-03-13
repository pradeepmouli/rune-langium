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
import { DataSchema } from '../../../generated/zod-schemas.js';

type FormData = StripIndexSignature<z.output<typeof DataSchema>>;

export function DataForm(props: {
  onValueChange?: (data: FormData) => void;
  onSubmit?: (data: FormData) => void;
  defaultValues?: Partial<FormData>;
  values?: FormData;
}) {
  const form = useForm<FormData>({
    resolver: zodResolver(DataSchema),
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
        <Field>
          <FieldLabel htmlFor="superType">Super Type</FieldLabel>
          <FieldControl>
            <Controller
              name={'superType'}
              control={control}
              render={({ field }) => (
                <TypeSelector
                  id="superType"
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
          <label>Attributes</label>
          {attributesFields.map((item, index) => (
            <div key={item.id}>
              <div>
                <label>0</label>
                <fieldset>
                  <legend>0</legend>
                  <Field>
                    <FieldLabel htmlFor="attributes.${index}.name">Name</FieldLabel>
                    <FieldControl>
                      <Input
                        id="attributes.${index}.name"
                        {...register(`attributes.${index}.name`)}
                      />
                    </FieldControl>
                  </Field>
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
                    <FieldLabel htmlFor="attributes.${index}.card">Card</FieldLabel>
                    <FieldControl>
                      <Controller
                        name={`attributes.${index}.card`}
                        control={control}
                        render={({ field }) => (
                          <CardinalitySelector
                            id={`attributes.${index}.card`}
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
              <button type="button" onClick={() => removeAttributes(index)}>
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              appendAttributes({
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
      </form>
    </FormProvider>
  );
}
