/**
 * Form-surface Zod schemas for editor forms.
 *
 * These are small projections of TypeNodeData fields — just the
 * user-editable properties that each form manages. They serve as:
 *
 * 1. react-hook-form validation schemas (via zodResolver)
 * 2. Compile-time conformance checks against TypeNodeData / MemberDisplay
 *
 * @module
 */

export {
  dataTypeFormSchema,
  enumFormSchema,
  choiceFormSchema,
  functionFormSchema,
  metadataSchema,
  attributeSchema,
  enumValueSchema,
  type DataTypeFormValues,
  type EnumFormValues,
  type ChoiceFormValues,
  type FunctionFormValues,
  type MetadataValues,
  type AttributeValues,
  type EnumValueValues
} from './form-schemas.js';

export { deriveUiSchema, type DeriveOptions } from './derive-ui-schema.js';
export {
  ExpressionNodeSchema,
  PlaceholderNodeSchema,
  UnsupportedNodeSchema,
  type ExpressionNode,
  type ExpressionNodeType
} from './expression-node-schema.js';
