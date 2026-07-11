// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * DS component-map adapter for @zod-to-form/vite (?z2f) generated forms.
 *
 * Maps z2f field component names to @rune-langium/design-system primitives so
 * generated forms render with the studio's own Radix/Tailwind tokens rather
 * than z2f's bundled shadcn copies.
 *
 * Each DS primitive is a NAMED export keyed by its z2f component name
 * (Checkbox, Input, Select, …); `z2f.config.ts` points `components.source`
 * at this module and the codegen imports the components it needs by name.
 *
 * Shape mirrors the `shadcnComponentMap` from @zod-to-form/react — each key
 * is a z2f component name (e.g. "Checkbox", "Input") and each value is the
 * React component or a thin adapter around the DS primitive.
 */

import * as React from 'react';
import { Checkbox as DSCheckbox } from '@rune-langium/design-system/ui/checkbox';
import { Input as DSInput } from '@rune-langium/design-system/ui/input';
import { Label as DSLabel } from '@rune-langium/design-system/ui/label';
import {
  Select as DSSelect,
  SelectContent as DSSelectContent,
  SelectItem as DSSelectItem,
  SelectTrigger as DSSelectTrigger,
  SelectValue as DSSelectValue
} from '@rune-langium/design-system/ui/select';
import {
  RadioGroup as DSRadioGroup,
  RadioGroupItem as DSRadioGroupItem
} from '@rune-langium/design-system/ui/radio-group';
import { Textarea as DSTextarea } from '@rune-langium/design-system/ui/textarea';

// ── Checkbox ────────────────────────────────────────────────────────────────
// z2f shadcn preset passes `checked` + `onCheckedChange`; DS Checkbox accepts
// the same props via Radix CheckboxPrimitive.Root.
export const Checkbox = DSCheckbox;

// ── Input ────────────────────────────────────────────────────────────────────
export const Input = DSInput;

// ── Textarea ─────────────────────────────────────────────────────────────────
export const Textarea = DSTextarea;

// ── Label ────────────────────────────────────────────────────────────────────
export const Label = DSLabel;

// ── Select ───────────────────────────────────────────────────────────────────
// z2f's shadcn preset emits:
//   <Select onValueChange={field.onChange}>
//     <SelectTrigger><SelectValue /></SelectTrigger>
//     <SelectContent>
//       {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
//     </SelectContent>
//   </Select>
// DS primitives accept the same props — re-export them directly.
export const Select = DSSelect;
export const SelectContent = DSSelectContent;
export const SelectItem = DSSelectItem;
export const SelectTrigger = DSSelectTrigger;
export const SelectValue = DSSelectValue;

// ── RadioGroup ───────────────────────────────────────────────────────────────
export const RadioGroup = DSRadioGroup;
export const RadioGroupItem = DSRadioGroupItem;

// ── Switch ───────────────────────────────────────────────────────────────────
// No Switch in the DS yet; fall back to a controlled checkbox-as-toggle
// with the same Radix-compatible prop contract (checked / onCheckedChange).
export const Switch = DSCheckbox;

// ── Field / FieldLabel / FieldDescription / FieldError ───────────────────────
// The shadcn preset's BUILT-IN FieldTemplate (there is no config hook to swap
// it for our own — @zod-to-form/core's `fieldTemplate` config option is
// declared but not yet consumed by the codegen) hardcodes an import of these
// 4 names from the component source module. They must exist under these
// exact names for `preset: 'shadcn'` generated forms to resolve at all.
export function Field({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="flex flex-col gap-1">{children}</div>;
}

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }): React.ReactElement {
  return (
    <DSLabel htmlFor={htmlFor} className="text-sm font-medium text-foreground">
      {children}
    </DSLabel>
  );
}

export function FieldDescription({ children }: { children: React.ReactNode }): React.ReactElement {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

export function FieldError({ children }: { children?: React.ReactNode }): React.ReactElement | null {
  if (!children) return null;
  return <p className="text-xs text-destructive">{children}</p>;
}

// ── FieldTemplate ────────────────────────────────────────────────────────────
// Controls label + input + error layout for every generated field.
// z2f resolves `FieldTemplate` by name from the componentModule.
export interface FieldTemplateProps {
  children: React.ReactNode;
  label: string;
  description?: string;
  helpText?: string;
  error?: string;
  name: string;
  required?: boolean;
  disabled?: boolean;
  deprecated?: boolean;
}

export function FieldTemplate({
  children,
  label,
  description,
  helpText,
  error,
  name,
  required
}: FieldTemplateProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <DSLabel htmlFor={name} className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </DSLabel>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {children}
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
