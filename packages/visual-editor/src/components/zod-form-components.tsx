// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * zod-form-components — Adapter barrel for z2f CLI-generated forms.
 *
 * Re-exports design-system primitives (Input, Textarea, Field, etc.) directly.
 * Controlled components (Select, TypeSelector, CardinalitySelector) are thin
 * wrappers that accept value/onChange — the codegen handles Controller wiring.
 *
 * @module
 */

import type { ReactNode } from 'react';
import { Input as DesignInput } from '@rune-langium/design-system/ui/input';
import { Textarea as DesignTextarea } from '@rune-langium/design-system/ui/textarea';
export * from '@rune-langium/design-system/ui/components';

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle
} from '@rune-langium/design-system/ui/field';

// z2f 0.4.0 codegen emits FieldControl — alias to FieldContent
const FieldControl = FieldContent;

import {
  Select as RadixSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@rune-langium/design-system/ui/select';

import { TypeSelector as RawTypeSelector } from './editors/TypeSelector.js';
import { CardinalityPicker } from './editors/CardinalityPicker.js';

// ---------------------------------------------------------------------------
// Native-compatible re-exports (register() works directly)
// ---------------------------------------------------------------------------

export const Input = DesignInput;
export const Textarea = DesignTextarea;

// Re-export field primitives (used by formPrimitives config)
export {
  Field,
  FieldContent,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle
};

// ---------------------------------------------------------------------------
// Controlled components — accept value/onChange from Controller
// ---------------------------------------------------------------------------

type ControlledProps = {
  id?: string;
  value?: unknown;
  onChange?: (value: unknown) => void;
  [key: string]: unknown;
};

export function Select({
  value,
  onChange,
  id,
  disabled,
  options,
  children,
  ...rest
}: ControlledProps & {
  disabled?: boolean;
  options?: Array<{ label: string; value: string }>;
  children?: ReactNode;
}) {
  return (
    <RadixSelect
      value={(value as string) ?? ''}
      onValueChange={onChange as (v: string) => void}
      disabled={disabled}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder="Select..." />
      </SelectTrigger>
      <SelectContent>
        {options
          ? options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))
          : children}
      </SelectContent>
    </RadixSelect>
  );
}

export function TypeSelector({ value, onChange, ...rest }: ControlledProps) {
  return (
    <RawTypeSelector
      value={(value as string) ?? ''}
      onSelect={(v) => onChange?.(v ?? '')}
      placeholder="Select type..."
    />
  );
}

export function CardinalitySelector({ value, onChange, ...rest }: ControlledProps) {
  return (
    <CardinalityPicker
      value={(value as string) ?? ''}
      onChange={onChange as (v: unknown) => void}
    />
  );
}
