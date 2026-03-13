/**
 * Form-surface Zod schemas for editor forms.
 *
 * These are small projections of the user-editable fields that
 * each form manages. Forms accept AnyGraphNode and use toFormValues()
 * to extract fields from the AST-shaped data.
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
