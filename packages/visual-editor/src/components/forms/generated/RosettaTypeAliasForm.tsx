import { useEffect } from 'react';
import { useForm, Controller, FormProvider } from 'react-hook-form';
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
import { RosettaTypeAliasSchema } from '../../../generated/zod-schemas.js';

type FormData = StripIndexSignature<z.output<typeof RosettaTypeAliasSchema>>;

export function RosettaTypeAliasForm(props: {
  onValueChange?: (data: FormData) => void;
  onSubmit?: (data: FormData) => void;
  defaultValues?: Partial<FormData>;
  values?: FormData;
}) {
  const form = useForm<FormData>({
    resolver: zodResolver(RosettaTypeAliasSchema),
    mode: 'onChange',
    defaultValues: props.defaultValues,
    values: props.values
  });
  const { register, watch, control } = form;
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
          <FieldLabel htmlFor="definition">Definition</FieldLabel>
          <FieldControl>
            <Textarea id="definition" {...register('definition')} rows={3} />
          </FieldControl>
        </Field>
        <div>
          <label>Type Call</label>
          <fieldset>
            <legend>Type Call</legend>
            <Field>
              <FieldLabel htmlFor="typeCall.type">Type</FieldLabel>
              <FieldControl>
                <Controller
                  name={'typeCall.type'}
                  control={control}
                  render={({ field }) => (
                    <TypeSelector
                      id="typeCall.type"
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
