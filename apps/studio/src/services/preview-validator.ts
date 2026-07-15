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
      // .optional() must wrap the INNER z.number() schema, not the outer
      // z.preprocess(...) pipeline (round-10 finding A) — mirrors the
      // 'string' case above. ZodOptional only short-circuits when the RAW
      // input is `undefined`, which runs BEFORE preprocess's transform; an
      // empty-string form value isn't `undefined` yet, so wrapping the
      // outer pipeline let '' fall through into the un-optional inner
      // schema and fail with "must be a number".
      const numberSchema = z.number({ error: `${field.label} must be a number` });
      return z.preprocess(
        (value) => {
          if (value === '' || value === undefined || value === null) return undefined;
          if (typeof value === 'number') return value;
          if (typeof value === 'string') return Number(value);
          return value;
        },
        field.required ? numberSchema : numberSchema.optional()
      );
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
      // .strict() so an unrecognized/typo'd key surfaces as a validation
      // error (Codex round-2 finding #1) — this only affects the verdict
      // this validator reports, never what instance-store.ts actually
      // persists to InstanceRecord.data (computed independently, never
      // derived from this validator's parsed/stripped output).
      const objectSchema = z.object(childShape).strict();

      // Nested Choice-arm enforcement (round-10 finding B): mirrors the
      // top-level "exactly one arm present" block in validatePreviewSample
      // below, but scoped to this object's own LOCAL values via
      // .superRefine() — see that block's doc comment for the full
      // rationale. `field.choiceArmPaths` (set by objectField for a NESTED
      // Data-extends-Choice reference) holds full dotted paths (e.g.
      // `constituent.commodity`), but at runtime, inside this nested Zod
      // object schema, the actual value keys are the LEAF property names
      // (e.g. `commodity`), so lookups here always go through
      // fieldLeafKey(). Zod's own path-tracking prefixes `ctx.addIssue`'s
      // `path` with however many levels this object field is itself
      // nested under, so this composes correctly at any depth.
      const armPaths = field.choiceArmPaths ?? [];
      const objectSchemaWithArms =
        armPaths.length > 0
          ? objectSchema.superRefine((value, ctx) => {
              const armFields = (field.children ?? []).filter((child) => armPaths.includes(child.path));
              const presentFields = armFields.filter(
                (child) => (value as Record<string, unknown>)[fieldLeafKey(child.path)] !== undefined
              );
              const presentCount = presentFields.length;
              if (presentCount !== 1) {
                ctx.addIssue({
                  code: 'custom',
                  path: [],
                  message: presentCount === 0 ? 'Choose one option.' : 'Only one option can be selected.'
                });
                return;
              }
              const selectedField = presentFields[0]!;
              const leafKey = fieldLeafKey(selectedField.path);
              const requiredFieldValidator = buildFieldValidator({ ...selectedField, required: true });
              const fieldResult = requiredFieldValidator.safeParse((value as Record<string, unknown>)[leafKey]);
              if (!fieldResult.success) {
                for (const issue of fieldResult.error.issues) {
                  ctx.addIssue({
                    code: 'custom',
                    path: [leafKey, ...issue.path],
                    message: issue.message
                  });
                }
              }
            })
          : objectSchema;

      return field.required ? objectSchemaWithArms : objectSchemaWithArms.optional();
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
  // .strict() — see the buildFieldValidator 'object' case for why (Codex
  // round-2 finding #1).
  return z
    .object(Object.fromEntries(fields.map((field) => [fieldRootKey(field.path), buildFieldValidator(field)])))
    .strict();
}

export function validatePreviewSample(
  schema: FormPreviewSchema,
  values: Record<string, unknown>
): { errors: Record<string, string>; valid: boolean } {
  const validator = buildSchemaValidator(schema.fields);
  const result = validator.safeParse(values);

  const errors: Record<string, string> = {};
  let valid = result.success;

  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = formatIssuePath(issue.path);
      errors[key] = issue.message;
    }
  }

  // A Choice schema's option fields are ALL generated with `required:
  // false` (FormPreviewPanel's ChoiceFieldGroup renders "which option is
  // chosen" via presence in `values`, not a required flag — see
  // ChoiceFieldGroup's `activeField` lookup), so the structural validator
  // above happily accepts both zero options present and multiple options
  // present simultaneously, even though the real generated Zod schema for
  // a Choice type is a strict union requiring exactly one arm (Codex
  // round-2 finding #2). Uses the same presence semantics ChoiceFieldGroup
  // already relies on for rendering: a root key's value is `!== undefined`.
  //
  // This "exactly one arm present" enforcement also applies to a
  // Data-extends-Choice / typeAlias-extends-Choice schema, whose Choice
  // ancestor's option fields sit alongside the Data type's own (separately,
  // normally required/optional-validated) attributes rather than being the
  // schema's entire field set — `schema.kind` stays `undefined`/`'typeAlias'`
  // for those, so `choiceArmPaths` (set by buildDataSchema /
  // buildTypeAliasSchema) is what scopes this block to just the arm fields
  // in that case, instead of every field in `schema.fields`.
  const armPaths = schema.kind === 'choice' ? schema.fields.map((field) => field.path) : (schema.choiceArmPaths ?? []);
  if (armPaths.length > 0) {
    const armFields = schema.fields.filter((field) => armPaths.includes(field.path));
    const presentFields = armFields.filter((field) => values[fieldRootKey(field.path)] !== undefined);
    const presentCount = presentFields.length;
    if (presentCount !== 1) {
      // Keyed at the empty path — the same schema-level (not field-level)
      // convention `formatIssuePath([])` produces, and the same convention
      // codegen-worker.ts's `validateInstance` already uses for its
      // schema-level "Unknown type" diagnostic (`path: ''`).
      errors[''] = presentCount === 0 ? 'Choose one option.' : 'Only one option can be selected.';
      valid = false;
    } else {
      // The single selected arm's own PreviewField is always generated with
      // `required: false` (see the doc comment above), so the structural
      // validator built it as OPTIONAL — an empty-sentinel value like `''`
      // trivially satisfies `.optional()` even though the real generated
      // Zod schema for the selected arm requires a genuinely non-empty
      // value (round-7 finding #3). Re-validate the selected field's actual
      // value with a REQUIRED variant of its validator, without touching
      // buildFieldValidator or the required:false convention itself.
      const selectedField = presentFields[0]!;
      const requiredFieldValidator = buildFieldValidator({ ...selectedField, required: true });
      const rootKey = fieldRootKey(selectedField.path);
      const fieldResult = requiredFieldValidator.safeParse(values[rootKey]);
      if (!fieldResult.success) {
        for (const issue of fieldResult.error.issues) {
          const key = formatIssuePath([rootKey, ...issue.path]);
          errors[key] = issue.message;
        }
        valid = false;
      }
    }
  }

  return { errors, valid };
}
