// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { defineConfig } from '@zod-to-form/core';

import type * as Components from './src/components/zod-form-components.js';
import type * as ZodSchemas from './src/generated/zod-schemas.js';

export default defineConfig<typeof Components, typeof ZodSchemas>({
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
    parent: { component: 'TypeSelector' },
    superType: { component: 'TypeSelector' },
    'attributes[].typeCall.type': { component: 'TypeSelector' },
    'typeCall.type': { component: 'TypeSelector' },
    'inputs[].typeCall.type': { component: 'TypeSelector' },
    'output.typeCall.type': { component: 'TypeSelector' },

    // Cardinality fields → CardinalitySelector
    'attributes[].card': { component: 'CardinalitySelector' },
    'inputs[].card': { component: 'CardinalitySelector' },
    'output.card': { component: 'CardinalitySelector' },

    // Definition fields → Textarea
    definition: { component: 'Textarea', props: { rows: 3 } },

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
        'attributes[].name': { component: 'Input', order: 1 },
        'attributes[].typeCall.type': { component: 'TypeSelector', order: 2 },
        'attributes[].card': { component: 'CardinalitySelector', order: 3 },
        'attributes[].override': { hidden: true },
        'attributes[].definition': { component: 'Textarea', props: { rows: 2 }, order: 4 }
      }
    },

    ChoiceSchema: {
      fields: {
        // Choice options: name + type reference
        'attributes[].name': { hidden: true },
        'attributes[].typeCall.type': { component: 'TypeSelector', order: 1 },
        'attributes[].definition': { component: 'Textarea', props: { rows: 2 }, order: 2 }
      }
    },

    RosettaEnumerationSchema: {
      fields: {
        // Enum values: name + display name
        'enumValues[].name': { component: 'Input', order: 1 },
        'enumValues[].display': { component: 'Input', order: 2 },
        'enumValues[].definition': { component: 'Textarea', props: { rows: 2 }, order: 3 }
      }
    },

    RosettaFunctionSchema: {
      fields: {
        // Input params: name + type + cardinality
        'inputs[].name': { component: 'Input', order: 1 },
        'inputs[].typeCall.type': { component: 'TypeSelector', order: 2 },
        'inputs[].card': { component: 'CardinalitySelector', order: 3 },
        // Output: type + cardinality
        'output.name': { hidden: true },
        'output.typeCall': { component: 'TypeSelector', order: 1 },
        'output.card': { component: 'CardinalitySelector', order: 2 },
        // Shortcuts — not user-editable in generated form
        shortcuts: { hidden: true }
      }
    },

    RosettaTypeAliasSchema: {
      fields: {
        // TypeAlias: wrapped type reference
        'typeCall.type': { component: 'TypeSelector', order: 1 },
        'typeCall.arguments': { hidden: true }
      }
    }
  }
});
