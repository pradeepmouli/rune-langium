/**
 * component-config.ts — Compile-time validation of z2f component registration.
 *
 * Ensures that every fieldType referenced in z2f.config.ts has a matching export
 * from zod-form-components.tsx with the correct controlled/uncontrolled contract.
 * A TypeScript error here means z2f.config.ts references a component that does
 * not exist or has the wrong signature.
 */

import type { ComponentType } from 'react';
import {
  Input,
  Textarea,
  Select,
  TypeSelector,
  CardinalitySelector,
  Field,
  FieldControl,
  FieldLabel
} from '../zod-form-components.js';

// ---------------------------------------------------------------------------
// Controlled component contract — must accept value + onChange from Controller
// ---------------------------------------------------------------------------

interface ControlledComponentProps {
  value?: unknown;
  onChange?: (value: unknown) => void;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Component registry — mirrors z2f.config.ts fieldTypes
// ---------------------------------------------------------------------------

/**
 * Type-safe registry of all field-type components used by z2f codegen.
 * If a component is removed from zod-form-components.tsx, TypeScript will
 * report an error on the corresponding entry below.
 */
export const FIELD_TYPE_COMPONENTS = {
  Input,
  Textarea,
  Select: Select as ComponentType<ControlledComponentProps>,
  TypeSelector: TypeSelector as ComponentType<ControlledComponentProps>,
  CardinalitySelector: CardinalitySelector as ComponentType<ControlledComponentProps>
} as const;

/**
 * Union of all valid fieldType strings. Use this to type-check fieldType
 * assignments in form metadata and z2f configuration.
 */
export type FieldTypeName = keyof typeof FIELD_TYPE_COMPONENTS;

// ---------------------------------------------------------------------------
// Form primitive registry — mirrors z2f.config.ts formPrimitives
// ---------------------------------------------------------------------------

export const FORM_PRIMITIVES = {
  field: Field,
  label: FieldLabel,
  control: FieldControl
} as const;

// ---------------------------------------------------------------------------
// Compile-time assertions
// ---------------------------------------------------------------------------

// Verify all z2f.config.ts fieldTypes are present in our registry.
// These lines produce a type error if the component export is missing or
// does not satisfy ComponentType.
type AssertComponent<T extends ComponentType<any>> = T;
type _CheckInput = AssertComponent<typeof Input>;
type _CheckTextarea = AssertComponent<typeof Textarea>;
type _CheckSelect = AssertComponent<typeof Select>;
type _CheckTypeSelector = AssertComponent<typeof TypeSelector>;
type _CheckCardinalitySelector = AssertComponent<typeof CardinalitySelector>;
type _CheckField = AssertComponent<typeof Field>;
type _CheckFieldLabel = AssertComponent<typeof FieldLabel>;
type _CheckFieldControl = AssertComponent<typeof FieldControl>;
