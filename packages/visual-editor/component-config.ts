/**
 * Component configuration for visual-editor form registries.
 *
 * Maps Rune DSL Zod schema types to visual-editor-specific widgets so
 * that ZodForm can render the correct component for each schema field.
 *
 * Usage:
 *   import { visualFormRegistry } from './component-config.js';
 *   <ZodForm schema={...} onSubmit={...} formRegistry={visualFormRegistry} />
 *
 * FR-008: Invalid widget names are rejected at compile time via ValidWidget.
 */

import { z } from 'zod';
import type { FormMeta } from '@zod-to-form/react';
import { TypeCallSchema, RosettaCardinalitySchema } from './src/generated/zod-schemas.js';

// ---------------------------------------------------------------------------
// Widget name vocabulary (FR-008 compile-time type safety)
// ---------------------------------------------------------------------------

/** Built-in component names from @zod-to-form/react's defaultComponentMap. */
type BuiltinWidget =
  | 'Input'
  | 'Textarea'
  | 'Checkbox'
  | 'Combobox'
  | 'Switch'
  | 'Select'
  | 'DatePicker'
  | 'RadioGroup'
  | 'FileInput';

/** Custom widget names provided by @rune-langium/visual-editor/components. */
type VisualEditorWidget = 'TypeSelector' | 'CardinalityPicker';

/** All valid fieldType values for this package's form registries (FR-008). */
export type ValidWidget = BuiltinWidget | VisualEditorWidget;

/**
 * Type-safe FormMeta constructor.
 * Passing an unknown widget name (e.g. 'BadWidget') is a compile error (FR-008).
 */
function fieldMeta(fieldType: ValidWidget): FormMeta {
  return { fieldType };
}

// ---------------------------------------------------------------------------
// Visual-editor form registry
// ---------------------------------------------------------------------------

/**
 * Form registry mapping Rune DSL schema types to visual-editor widgets.
 *
 * - TypeCallSchema    → 'TypeSelector'       (cross-ref type picker)
 * - RosettaCardinalitySchema → 'CardinalityPicker' (inf..sup toggle)
 *
 * Pass as `formRegistry` prop to `ZodForm` when rendering Attribute forms.
 */
export const visualFormRegistry = z.registry<FormMeta>();

visualFormRegistry.add(TypeCallSchema, fieldMeta('TypeSelector'));
visualFormRegistry.add(RosettaCardinalitySchema, fieldMeta('CardinalityPicker'));
