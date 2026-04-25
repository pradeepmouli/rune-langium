// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Typed configuration for `@zod-to-form` against the visual-editor's
 * form-surface schemas.
 *
 * Per FR-008 and research R1 of `specs/013-z2f-editor-migration`, the
 * canonical schemas referenced here MUST be the *projection* schemas
 * defined in `src/schemas/form-schemas.ts` — not the langium-generated
 * AST schemas in `src/generated/zod-schemas.ts`. AST schemas remain a
 * separate validation surface used by tests and conformance checks; no
 * form consumes them directly.
 *
 * The mapping is:
 *   DataSchema (AST)              → dataTypeFormSchema (projection)
 *   ChoiceSchema (AST)            → choiceFormSchema (projection)
 *   RosettaEnumerationSchema (AST)→ enumFormSchema (projection)
 *   RosettaFunctionSchema (AST)   → functionFormSchema (projection)
 *   RosettaTypeAliasSchema (AST)  → typeAliasFormSchema (projection)
 *
 * Field-path mapping (post-projection):
 *   attributes[].typeCall.type    → members[].typeName
 *   attributes[].card             → members[].cardinality
 *   attributes[].name             → members[].name
 *   inputs[].typeCall.type        → members[].typeName  (Function inputs reuse memberSchema)
 *   inputs[].card                 → members[].cardinality
 *   output.typeCall.type          → outputType  (flat string in functionFormSchema)
 */

import { defineConfig } from '@zod-to-form/core';

import type * as Components from './src/components/zod-form-components.js';
import type * as FormSchemas from './src/schemas/form-schemas.js';

export default defineConfig<typeof Components, typeof FormSchemas>({
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
    'dataTypeFormSchema',
    'choiceFormSchema',
    'enumFormSchema',
    'functionFormSchema',
    'typeAliasFormSchema'
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
    // --- Global field mappings (apply across all form-surface schemas) ---

    // Cross-reference / inheritance
    parentName: { component: 'TypeSelector' },
    'members[].typeName': { component: 'TypeSelector' },
    outputType: { component: 'TypeSelector' },

    // Cardinality
    'members[].cardinality': { component: 'CardinalitySelector' },

    // Definition / metadata fields are rendered by sections (see schemas.{X})
    definition: { component: 'Textarea', props: { rows: 3 } },
    comments: { component: 'Textarea', props: { rows: 2 } },

    // Synonyms — rendered by MetadataSection (kept hidden so the default
    // walker doesn't try to render the array directly)
    synonyms: { hidden: true }
  },
  schemas: {
    // --- Per-schema field overrides ---

    dataTypeFormSchema: {
      fields: {
        // Attributes list: member rows with name, type, cardinality
        'members[].name': { component: 'Input', order: 1 },
        'members[].typeName': { component: 'TypeSelector', order: 2 },
        'members[].cardinality': { component: 'CardinalitySelector', order: 3 },
        'members[].isOverride': { hidden: true },
        'members[].displayName': { hidden: true }
      }
    },

    choiceFormSchema: {
      fields: {
        // Choice options: type reference is the primary affordance; name is
        // hidden because choice options are name-less in the surface UX.
        'members[].name': { hidden: true },
        'members[].typeName': { component: 'TypeSelector', order: 1 },
        'members[].cardinality': { hidden: true },
        'members[].isOverride': { hidden: true },
        'members[].displayName': { hidden: true }
      }
    },

    enumFormSchema: {
      fields: {
        // Enum values: name + display name
        'members[].name': { component: 'Input', order: 1 },
        'members[].displayName': { component: 'Input', order: 2 },
        'members[].typeName': { hidden: true },
        'members[].cardinality': { hidden: true },
        'members[].isOverride': { hidden: true }
      }
    },

    functionFormSchema: {
      fields: {
        // Input params reuse memberSchema (name + type + cardinality)
        'members[].name': { component: 'Input', order: 1 },
        'members[].typeName': { component: 'TypeSelector', order: 2 },
        'members[].cardinality': { component: 'CardinalitySelector', order: 3 },
        'members[].isOverride': { hidden: true },
        'members[].displayName': { hidden: true },
        // Function-specific output / expression
        outputType: { component: 'TypeSelector', order: 4 },
        expressionText: { component: 'Textarea', props: { rows: 4 }, order: 5 }
      }
    },

    typeAliasFormSchema: {
      fields: {
        // TypeAlias projection currently exposes only name + metadata; the
        // wrapped type reference lives outside the projection (handled by the
        // editor host directly until the projection is extended).
      }
    }
  }
});
