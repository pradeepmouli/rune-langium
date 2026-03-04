import { defineComponentConfig } from '@zod-to-form/core';
import type * as typ from './src/components/zod-form-components.js'; // Re-export all components from the design system for use in generated forms

type components = typeof typ;

export default defineComponentConfig<components, any>({
  components: '@/components/zod-form-components',

  formPrimitives: {
    field: 'Field',
    label: 'FieldLabel',
    control: 'FieldContent'
  },
  fieldTypes: {
    Input: { component: 'Input' },
    Textarea: { component: 'Textarea' },
    Select: { component: 'Select' },
    TypeSelector: { component: 'TypeSelector' },
    CardinalitySelector: { component: 'CardinalitySelector' }
  },
  fields: {
    parent: { fieldType: 'TypeSelector' },
    superType: { fieldType: 'TypeSelector' },
    'attributes[].typeCall.type': { fieldType: 'TypeSelector' },
    'attributes[].card': { fieldType: 'CardinalitySelector' }
  }
});
