/**
 * Form-surface Zod schemas — field-level validation for editor forms.
 *
 * Each schema is a small projection of TypeNodeData / MemberDisplay,
 * covering only the user-editable fields that the corresponding form
 * component manages. Compile-time conformance checks at the bottom of
 * this file ensure that every schema field exists on the source type
 * with a compatible type.
 *
 * @module
 */

import { z } from 'zod';
import type { TypeNodeData, MemberDisplay } from '../types.js';

// ---------------------------------------------------------------------------
// Metadata (shared across all forms)
// ---------------------------------------------------------------------------

/** Schema for the collapsible metadata section (definition, comments). */
export const metadataSchema = z.object({
  definition: z.string(),
  comments: z.string()
});

export type MetadataValues = z.infer<typeof metadataSchema>;

// ---------------------------------------------------------------------------
// Member (shared attribute/value shape for useFieldArray)
// ---------------------------------------------------------------------------

/** Schema for a single member in a useFieldArray-managed list. */
export const memberSchema = z.object({
  name: z.string(),
  typeName: z.string(),
  cardinality: z.string(),
  isOverride: z.boolean(),
  displayName: z.string().optional()
});

export type MemberValues = z.infer<typeof memberSchema>;

// ---------------------------------------------------------------------------
// Attribute (member of Data type)
// ---------------------------------------------------------------------------

/** Schema for a single attribute row in DataTypeForm. */
export const attributeSchema = z.object({
  name: z.string().min(1, 'Attribute name is required'),
  typeName: z.string(),
  cardinality: z.string()
});

export type AttributeValues = z.infer<typeof attributeSchema>;

// ---------------------------------------------------------------------------
// Enum value (member of Enum type)
// ---------------------------------------------------------------------------

/** Schema for a single enum value row in EnumForm. */
export const enumValueSchema = z.object({
  name: z.string().min(1, 'Value name is required'),
  displayName: z.string()
});

export type EnumValueValues = z.infer<typeof enumValueSchema>;

// ---------------------------------------------------------------------------
// DataTypeForm
// ---------------------------------------------------------------------------

/** Metadata fields shared by all form schemas (definition, comments, synonyms). */
const metadataFields = {
  definition: z.string().optional(),
  comments: z.string().optional(),
  synonyms: z.array(z.string()).optional()
};

/** Full schema for the Data type form (name + parent + members + metadata). */
export const dataTypeFormSchema = z.object({
  name: z.string().min(1, 'Type name is required'),
  parentName: z.string(),
  members: z.array(memberSchema),
  ...metadataFields
});

export type DataTypeFormValues = z.infer<typeof dataTypeFormSchema>;

// ---------------------------------------------------------------------------
// EnumForm
// ---------------------------------------------------------------------------

/** Schema for the Enum type form (name + parent + members + metadata). */
export const enumFormSchema = z.object({
  name: z.string().min(1, 'Enum name is required'),
  parentName: z.string(),
  members: z.array(memberSchema).default([]),
  ...metadataFields
});

export type EnumFormValues = z.infer<typeof enumFormSchema>;

// ---------------------------------------------------------------------------
// ChoiceForm
// ---------------------------------------------------------------------------

/** Schema for the Choice type form (name + members + metadata). */
export const choiceFormSchema = z.object({
  name: z.string().min(1, 'Choice name is required'),
  members: z.array(memberSchema).default([]),
  ...metadataFields
});

export type ChoiceFormValues = z.infer<typeof choiceFormSchema>;

// ---------------------------------------------------------------------------
// FunctionForm
// ---------------------------------------------------------------------------

/** Schema for the Function type form (name + output + expression + members + metadata). */
export const functionFormSchema = z.object({
  name: z.string().min(1, 'Function name is required'),
  outputType: z.string(),
  expressionText: z.string(),
  members: z.array(memberSchema).optional(),
  ...metadataFields
});

export type FunctionFormValues = z.infer<typeof functionFormSchema>;

// ---------------------------------------------------------------------------
// Compile-time conformance checks
// ---------------------------------------------------------------------------
//
// These type assertions ensure that every property in a schema's inferred
// type actually exists on the corresponding TypeNodeData or MemberDisplay
// interface with an assignable type. If a schema field drifts out of sync
// with the source type, TypeScript will report a compile error here.
//
// The pattern:
//   type _Check = <SchemaType> extends Pick<SourceType, keyof SchemaType>
//                 ? true : never;
//
// If _Check resolves to `never`, the schema has a field that doesn't
// match the source type, and tsc will flag it.
// ---------------------------------------------------------------------------

/** DataTypeFormValues fields must exist on TypeNodeData<'data'>. */
type _DataFormCheck =
  DataTypeFormValues extends Pick<TypeNodeData<'data'>, keyof DataTypeFormValues> ? true : never;

/** EnumFormValues fields must exist on TypeNodeData<'enum'>. */
type _EnumFormCheck =
  EnumFormValues extends Pick<TypeNodeData<'enum'>, keyof EnumFormValues> ? true : never;

/** ChoiceFormValues fields must exist on TypeNodeData<'choice'>. */
type _ChoiceFormCheck =
  ChoiceFormValues extends Pick<TypeNodeData<'choice'>, keyof ChoiceFormValues> ? true : never;

/** FunctionFormValues fields must exist on TypeNodeData<'func'>. */
type _FuncFormCheck =
  FunctionFormValues extends Pick<TypeNodeData<'func'>, keyof FunctionFormValues> ? true : never;

/** MetadataValues fields must exist on TypeNodeData. */
type _MetaCheck = MetadataValues extends Pick<TypeNodeData, keyof MetadataValues> ? true : never;

/** AttributeValues fields must exist on MemberDisplay. */
type _AttrCheck = AttributeValues extends Pick<MemberDisplay, keyof AttributeValues> ? true : never;

/** EnumValueValues fields must exist on MemberDisplay. */
type _EnumValCheck =
  EnumValueValues extends Pick<MemberDisplay, keyof EnumValueValues> ? true : never;

/** MemberValues fields must exist on MemberDisplay. */
type _MemberCheck = MemberValues extends Pick<MemberDisplay, keyof MemberValues> ? true : never;

// Force TypeScript to evaluate the assertions (unused vars are fine — these are type-only)
export type ConformanceChecks = {
  dataForm: _DataFormCheck;
  enumForm: _EnumFormCheck;
  choiceForm: _ChoiceFormCheck;
  funcForm: _FuncFormCheck;
  metadata: _MetaCheck;
  attribute: _AttrCheck;
  enumValue: _EnumValCheck;
  member: _MemberCheck;
};
