// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import type { FieldTemplateProps } from '@zod-to-form/react';
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@rune-langium/design-system/ui/field';

/** Shared composition for CLI-generated forms and runtime component modules. */
export function FieldTemplate({
  children,
  label,
  description,
  helpText,
  error,
  name,
  required,
  disabled,
  deprecated
}: FieldTemplateProps) {
  return (
    <Field data-invalid={Boolean(error)} data-disabled={disabled || undefined}>
      <FieldLabel htmlFor={name} className={deprecated ? 'line-through' : undefined}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </FieldLabel>
      <FieldContent>{children}</FieldContent>
      {description && <FieldDescription>{description}</FieldDescription>}
      {helpText && <FieldDescription>{helpText}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}
export default FieldTemplate;
