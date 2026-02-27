import type { ZodToFormComponentConfig } from '@zod-to-form/cli';

// Type alias — erased at compile time; jiti never sees it.
// Gives TypeScript the module shape so `component: keyof VisualModule` is checked.
type VisualModule = typeof import('@rune-langium/visual-editor/components');

export default {
  components: '@rune-langium/visual-editor/components',

  fieldTypes: {
    'cross-ref':   { component: 'TypeSelector' },
    'cardinality': { component: 'CardinalityPicker' },
  },

  fields: {
    // Data type parent (inherits from another Data type)
    'dataTypeForm.parentName':   { fieldType: 'cross-ref', props: { refType: 'Data' } },
    // Attribute type reference and cardinality
    'attributeForm.typeName':    { fieldType: 'cross-ref' },
    'attributeForm.cardinality': { fieldType: 'cardinality' },
    // Function output type
    'functionForm.outputType':   { fieldType: 'cross-ref' },
    // Enum parent
    'enumForm.parentName':       { fieldType: 'cross-ref', props: { refType: 'Enum' } },
    // Shared member schema (used by useFieldArray rows)
    'memberSchema.typeName':     { fieldType: 'cross-ref' },
    'memberSchema.cardinality':  { fieldType: 'cardinality' },
  },
} satisfies ZodToFormComponentConfig<VisualModule>;
