// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { createContext, useContext, useMemo } from 'react';
import { z } from 'zod';
import { normalizeFormValues } from '@zod-to-form/core';
import {
  Controller,
  FormProvider,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
  type FormProviderProps
} from 'react-hook-form';

type Validate = (value: unknown) => true | string;
const ValidationContext = createContext<((name: string) => Validate | undefined) | null>(null);

/** Resolve an atomic field without reproducing any schema constraints. */
function fieldSchema(root: z.ZodObject, path: string): z.ZodType | undefined {
  let schema: z.ZodType | undefined = root;
  for (const segment of path.split('.')) {
    while (
      schema instanceof z.ZodOptional ||
      schema instanceof z.ZodNullable ||
      schema instanceof z.ZodDefault ||
      schema instanceof z.ZodReadonly
    )
      schema = schema.unwrap() as z.ZodType;
    if (schema instanceof z.ZodLazy) schema = schema.unwrap() as z.ZodType;
    if (schema instanceof z.ZodObject) schema = schema.shape[segment];
    else if (schema instanceof z.ZodArray && /^\d+$/.test(segment)) schema = schema.element as z.ZodType;
    else return undefined;
  }
  return schema;
}

/** Supplies L1 rules to bespoke editor controls, including identifier unions. */
export function EditorFormProvider<T extends FieldValues>({
  schema,
  children,
  ...form
}: FormProviderProps<T> & { schema: z.ZodObject }) {
  const getValidate = useMemo(() => {
    const validators = new Map<string, Validate | undefined>();
    return (name: string) => {
      const key = name.replace(/\.\d+(?=\.|$)/g, '.0');
      if (!validators.has(key)) {
        const atomic = fieldSchema(schema, key);
        validators.set(
          key,
          atomic
            ? (value) => {
                const result = atomic.safeParse(normalizeFormValues(value));
                return result.success || result.error.issues[0]?.message || 'Validation failed';
              }
            : undefined
        );
      }
      return validators.get(key);
    };
  }, [schema]);
  return (
    <ValidationContext.Provider value={getValidate}>
      <FormProvider {...form}>{children}</FormProvider>
    </ValidationContext.Provider>
  );
}

/** Falls back to ordinary RHF behavior when mounted outside an EditorForm. */
export function EditorController<T extends FieldValues, N extends FieldPath<T>>(props: ControllerProps<T, N>) {
  const getValidate = useContext(ValidationContext);
  const validate = getValidate?.(props.name);
  const existing = props.rules?.validate;
  return (
    <Controller
      {...props}
      rules={
        validate
          ? {
              ...props.rules,
              validate: {
                ...(typeof existing === 'function' ? { custom: existing } : existing),
                zodSchema: validate
              }
            }
          : props.rules
      }
    />
  );
}
