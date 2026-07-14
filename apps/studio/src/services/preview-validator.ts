// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { z } from 'zod';
import type { FormPreviewSchema, PreviewField } from '@rune-langium/codegen/export';

export function fieldRootKey(path: string): string {
  return path.split('.')[0]!.split('[]').join('');
}

export function fieldLeafKey(path: string): string {
  const parts = path.split('.');
  return parts[parts.length - 1]!.split('[]').join('');
}

export function formatIssuePath(path: ReadonlyArray<PropertyKey>): string {
  return path
    .filter((segment): segment is string | number => typeof segment === 'string' || typeof segment === 'number')
    .map((segment) => (typeof segment === 'number' ? `[${segment}]` : segment))
    .join('.')
    .replace('.[', '[');
}

export function buildFieldValidator(field: PreviewField): z.ZodTypeAny {
  switch (field.kind) {
    case 'string': {
      return field.required
        ? z.preprocess(
            (value) => (typeof value === 'string' ? value : ''),
            z.string().trim().min(1, `${field.label} is required`)
          )
        : z.preprocess((value) => (value === '' ? undefined : value), z.string().trim().optional());
    }
    case 'number': {
      const base = z.preprocess(
        (value) => {
          if (value === '' || value === undefined || value === null) return undefined;
          if (typeof value === 'number') return value;
          if (typeof value === 'string') return Number(value);
          return value;
        },
        z.number({ error: `${field.label} must be a number` })
      );
      return field.required ? base : base.optional();
    }
    case 'boolean':
      return field.required ? z.boolean() : z.boolean().optional();
    case 'enum': {
      const values = (field.enumValues ?? []).map((value) => value.value);
      if (values.length === 0) return z.string();
      const schema = z.enum(values as [string, ...string[]]);
      return field.required
        ? z.preprocess((value) => (value === '' ? undefined : value), schema)
        : z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
    }
    case 'object': {
      const childShape = Object.fromEntries(
        (field.children ?? []).map((child) => [fieldLeafKey(child.path), buildFieldValidator(child)])
      );
      const objectSchema = z.object(childShape);
      return field.required ? objectSchema : objectSchema.optional();
    }
    case 'array': {
      const [child] = field.children ?? [];
      const item = child ? buildFieldValidator(child) : z.string();
      let arraySchema = z.array(item);
      if (field.cardinality?.min !== undefined) {
        arraySchema = arraySchema.min(
          field.cardinality.min,
          `Add at least ${field.cardinality.min} ${field.label.toLowerCase()} item${field.cardinality.min === 1 ? '' : 's'}`
        );
      }
      if (typeof field.cardinality?.max === 'number') {
        arraySchema = arraySchema.max(
          field.cardinality.max,
          `Use at most ${field.cardinality.max} ${field.label.toLowerCase()} item${field.cardinality.max === 1 ? '' : 's'}`
        );
      }
      return field.required ? arraySchema : arraySchema.optional();
    }
    default:
      return z.any();
  }
}

export function buildSchemaValidator(fields: PreviewField[]): z.ZodObject<Record<string, z.ZodTypeAny>> {
  return z.object(Object.fromEntries(fields.map((field) => [fieldRootKey(field.path), buildFieldValidator(field)])));
}

export function validatePreviewSample(
  schema: FormPreviewSchema,
  values: Record<string, unknown>
): { errors: Record<string, string>; valid: boolean } {
  const validator = buildSchemaValidator(schema.fields);
  const result = validator.safeParse(values);

  if (result.success) {
    return { errors: {}, valid: true };
  }

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = formatIssuePath(issue.path);
    errors[key] = issue.message;
  }
  return { errors, valid: false };
}
