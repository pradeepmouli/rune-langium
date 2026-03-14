/**
 * Form-surface Zod schemas — field-level validation for editor forms.
 *
 * Each schema is a small projection of the user-editable fields that
 * each form component manages. Forms accept AnyGraphNode as input and
 * use toFormValues() to extract these fields from the AST-shaped data.
 *
 * @module
 */

import { z } from 'zod';

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
// TypeAliasForm
// ---------------------------------------------------------------------------

/** Schema for the TypeAlias form (name + metadata). */
export const typeAliasFormSchema = z.object({
  name: z.string().min(1, 'Type alias name is required'),
  ...metadataFields
});

export type TypeAliasFormValues = z.infer<typeof typeAliasFormSchema>;

// Conformance checks removed — forms now accept AnyGraphNode directly
// and extract fields via toFormValues(). Schema shapes are validated at
// runtime by zod, not at compile time against a specific source type.
