/**
 * Generic schema transformation utility for deriving UI schemas from
 * generated z.looseObject schemas.
 *
 * Supports pick/override/extend/omitType transformations for both
 * expression node schemas and form schemas.
 *
 * @module
 */

import { z } from 'zod';

/** Accept any ZodObject regardless of config (covers both $loose and 'passthrough'). */
export type LooseObjectSchema = z.ZodObject<z.ZodRawShape, any>;

export interface DeriveOptions<TOverrides extends z.ZodRawShape = z.ZodRawShape> {
  /**
   * Fields to pick from the source schema. If omitted, all fields are kept.
   */
  pick?: string[];

  /**
   * Field overrides — replaces matched fields in the source schema.
   * Handles reference relaxation, field relaxation, and validation additions.
   */
  overrides?: TOverrides;

  /**
   * Additional fields not present in the source schema.
   * Used for UI-only fields (e.g., `id`).
   */
  extend?: z.ZodRawShape;

  /**
   * Strip the $type discriminator from the output.
   * Used for form schemas that don't need $type in their shape.
   * Default: false (keep $type).
   */
  omitType?: boolean;
}

/**
 * Derive a UI schema from a generated z.looseObject schema.
 *
 * Pipeline: pick → omitType → overrides → extend
 *
 * @example Expression node — add id, relax children:
 *   deriveUiSchema(ArithmeticOperationSchema, {
 *     extend: { id: z.string().min(1) },
 *     overrides: { left: exprChild, right: exprChild },
 *   })
 *
 * @example Form schema — pick fields, add validation:
 *   deriveUiSchema(DataSchema, {
 *     pick: ['name'],
 *     overrides: { name: z.string().min(1, 'Type name is required') },
 *     extend: { parentName: z.string() },
 *     omitType: true,
 *   })
 */
export function deriveUiSchema<T extends LooseObjectSchema>(
  source: T,
  options: DeriveOptions = {}
): z.ZodObject<z.ZodRawShape, any> {
  const { pick, overrides, extend, omitType } = options;

  // Step 1: Pick (if specified, select only these fields from source)
  let schema: z.ZodObject<z.ZodRawShape, any> = pick
    ? (source.pick(Object.fromEntries(pick.map((k) => [k, true])) as Record<string, true>) as any)
    : source;

  // Step 2: Omit $type if requested (form schemas don't need it)
  if (omitType) {
    schema = schema.omit({ $type: true }) as any;
  }

  // Step 3: Apply overrides (relaxation, validation, reference resolution)
  if (overrides) {
    schema = schema.extend(overrides) as any;
  }

  // Step 4: Extend with UI-only fields
  if (extend) {
    schema = schema.extend(extend) as any;
  }

  return schema;
}
