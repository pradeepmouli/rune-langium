// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { useForm, Controller } from 'react-hook-form';
import { Form, Field, FieldLabel, FieldError, Input, Button } from '@rune-langium/design-system';

// J08 edit round-trip: attribute editor wired through Form (react-hook-form provider).
export const AttributeEditor = () => {
  const methods = useForm({ defaultValues: { name: 'tradeDate', type: 'date' } });
  return (
    <Form {...methods}>
      <form className="flex w-[360px] flex-col gap-3 rounded-md border border-border bg-card p-4">
        <Controller
          control={methods.control}
          name="name"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="f-name">Attribute name</FieldLabel>
              <Input id="f-name" {...field} />
            </Field>
          )}
        />
        <Controller
          control={methods.control}
          name="type"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="f-type">Type</FieldLabel>
              <Input id="f-type" {...field} />
            </Field>
          )}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" type="button">
            Cancel
          </Button>
          <Button size="sm" type="button">
            Apply
          </Button>
        </div>
      </form>
    </Form>
  );
};

// J09 form-function: invalid field state through Form.
export const InvalidField = () => {
  const methods = useForm({ defaultValues: { fn: 'compute price' } });
  return (
    <Form {...methods}>
      <form className="w-[360px] rounded-md border border-border bg-card p-4">
        <Field data-invalid="true">
          <FieldLabel htmlFor="f-fn">Function name</FieldLabel>
          <Input id="f-fn" aria-invalid="true" {...methods.register('fn')} />
          <FieldError errors={[{ message: 'Function names must be a single identifier.' }]} />
        </Field>
      </form>
    </Form>
  );
};
