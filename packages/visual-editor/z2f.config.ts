import { defineConfig } from '@zod-to-form/core';

export default defineConfig({
  components: '@/components/zod-form-components',
  formPrimitives: {
    field: 'Field',
    label: 'FieldLabel',
    control: 'FieldControl'
  },
  defaults: {
    mode: 'auto-save',
    ui: 'shadcn',
    overwrite: true,
    serverAction: false
  },
  include: [
    'DataSchema',
    'RosettaEnumerationSchema',
    'ChoiceSchema',
    'RosettaFunctionSchema',
    'RosettaTypeAliasSchema'
  ],
  exclude: [],
  fieldTypes: {
    CardinalitySelector: { component: 'CardinalitySelector', controlled: true },
    Input: { component: 'Input' },
    Select: { component: 'Select', controlled: true },
    Textarea: { component: 'Textarea' },
    TypeSelector: { component: 'TypeSelector', controlled: true }
  },
  fields: {
    // --- Global field mappings (apply across all schemas) ---

    // Cross-reference fields → TypeSelector
    parent: { fieldType: 'TypeSelector' },
    superType: { fieldType: 'TypeSelector' },
    'attributes[].typeCall.type': { fieldType: 'TypeSelector' },
    'typeCall.type': { fieldType: 'TypeSelector' },
    'inputs[].typeCall.type': { fieldType: 'TypeSelector' },
    'output.typeCall.type': { fieldType: 'TypeSelector' },

    // Cardinality fields → CardinalitySelector
    'attributes[].card': { fieldType: 'CardinalitySelector' },
    'inputs[].card': { fieldType: 'CardinalitySelector' },
    'output.card': { fieldType: 'CardinalitySelector' },

    // Definition fields → Textarea
    definition: { fieldType: 'Textarea', props: { rows: 3 } },

    // --- Hidden fields (handled by custom section components) ---

    // $type discriminators — internal, never user-editable
    $type: { hidden: true },
    'attributes[].$type': { hidden: true },
    'attributes[].typeCall.$type': { hidden: true },
    'attributes[].typeCall.arguments': { hidden: true },
    'enumValues[].$type': { hidden: true },
    'inputs[].$type': { hidden: true },
    'inputs[].typeCall.$type': { hidden: true },
    'inputs[].typeCall.arguments': { hidden: true },
    'typeCall.$type': { hidden: true },
    'output.$type': { hidden: true },

    // Annotations — rendered by AnnotationSection
    annotations: { hidden: true },
    'attributes[].annotations': { hidden: true },
    'enumValues[].annotations': { hidden: true },

    // Conditions — rendered by ConditionSection
    conditions: { hidden: true },
    postConditions: { hidden: true },

    // Synonyms — rendered by MetadataSection
    synonyms: { hidden: true },
    'attributes[].synonyms': { hidden: true },
    'enumValues[].enumSynonyms': { hidden: true },

    // References — not user-editable in forms
    references: { hidden: true },
    'attributes[].references': { hidden: true },
    'enumValues[].references': { hidden: true },

    // Labels & rule references — not user-editable in forms
    'attributes[].labels': { hidden: true },
    'attributes[].ruleReferences': { hidden: true },

    // Comments — rendered by MetadataSection
    comments: { hidden: true }
  },
  schemas: {
    // --- Per-schema field overrides ---

    DataSchema: {
      fields: {
        // Attributes list: member rows with name, type, cardinality
        'attributes[].name': { fieldType: 'Input', order: 1 },
        'attributes[].typeCall.type': { fieldType: 'TypeSelector', order: 2 },
        'attributes[].card': { fieldType: 'CardinalitySelector', order: 3 },
        'attributes[].override': { hidden: true },
        'attributes[].definition': { fieldType: 'Textarea', props: { rows: 2 }, order: 4 }
      }
    },

    ChoiceSchema: {
      fields: {
        // Choice options: name + type reference
        'attributes[].name': { hidden: true },
        'attributes[].typeCall.type': { fieldType: 'TypeSelector', order: 1 },
        'attributes[].definition': { fieldType: 'Textarea', props: { rows: 2 }, order: 2 }
      }
    },

    RosettaEnumerationSchema: {
      fields: {
        // Enum values: name + display name
        'enumValues[].name': { fieldType: 'Input', order: 1 },
        'enumValues[].display': { fieldType: 'Input', order: 2 },
        'enumValues[].definition': { fieldType: 'Textarea', props: { rows: 2 }, order: 3 }
      }
    },

    RosettaFunctionSchema: {
      fields: {
        // Input params: name + type + cardinality
        'inputs[].name': { fieldType: 'Input', order: 1 },
        'inputs[].typeCall.type': { fieldType: 'TypeSelector', order: 2 },
        'inputs[].card': { fieldType: 'CardinalitySelector', order: 3 },
        // Output: type + cardinality
        'output.name': { hidden: true },
        'output.typeCall': { fieldType: 'TypeSelector', order: 1 },
        'output.card': { fieldType: 'CardinalitySelector', order: 2 },
        // Shortcuts — not user-editable in generated form
        shortcuts: { hidden: true }
      }
    },

    RosettaTypeAliasSchema: {
      fields: {
        // TypeAlias: wrapped type reference
        'typeCall.type': { fieldType: 'TypeSelector', order: 1 },
        'typeCall.arguments': { hidden: true }
      }
    }
  }
});
