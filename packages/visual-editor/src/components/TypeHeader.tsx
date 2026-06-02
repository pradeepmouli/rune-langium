// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * TypeHeader — the single shared header for a model type: a namespace eyebrow,
 * the type name, and the canonical KindBadge. Used by the type-specific form
 * editors (name EDITABLE via react-hook-form) and the read-only OtherForm
 * (static name). Pass `control` (+ onNameChange/placeholder/nameAriaLabel) for
 * the editable variant, or `name` for the read-only variant.
 */
import * as React from 'react';
import { Controller, type Control } from 'react-hook-form';
import { Field, FieldError } from '@rune-langium/design-system/ui/field';
import { Input } from '@rune-langium/design-system/ui/input';
import { cn } from '@rune-langium/design-system/utils';
import { KindBadge } from './KindBadge.js';
import { useEditorActionsContext } from './forms/sections/EditorActionsContext.js';
import type { TypeKind } from '../types.js';

/**
 * Shared className for the type-form header across ALL inspector forms — one
 * full-bleed band reaching the panel edges (negative margins cancel the form's
 * `p-4` wrapper). The header's own `px-4` then re-insets its content so it
 * aligns with the body content below. Every type form uses this identical class
 * with an identical `p-4` wrapper, so the header looks the same everywhere.
 */
export const INSPECTOR_FORM_HEADER_CLASS = '-mx-4 -mt-4';

export interface TypeHeaderProps {
  kind: TypeKind;
  namespace?: string;
  className?: string;
  /** Rendered after the KindBadge (e.g. a "Reference Only" badge in OtherForm). */
  trailing?: React.ReactNode;
  /** Editable variant: react-hook-form control bound to the "name" field. */
  control?: Control<any>;
  onNameChange?: (value: string) => void;
  placeholder?: string;
  nameAriaLabel?: string;
  /** Read-only variant: static name (used when `control` is absent). */
  name?: string;
}

export function TypeHeader({
  kind,
  namespace,
  className,
  trailing,
  control,
  onNameChange,
  placeholder,
  nameAriaLabel,
  name
}: TypeHeaderProps): React.ReactElement {
  const editorCtx = useEditorActionsContext();
  const nameReadOnly = editorCtx?.readOnly ?? false;
  return (
    <div
      data-slot="type-header"
      className={cn('sticky top-0 z-10 flex items-center gap-2 border-b bg-muted px-4 py-2', className)}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        {namespace && (
          <span data-slot="type-header-namespace" className="truncate text-xs text-muted-foreground">
            {namespace}
          </span>
        )}
        {control ? (
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState }) =>
              nameReadOnly ? (
                <h3 data-slot="type-name" className="truncate px-1 text-lg font-semibold">
                  {field.value}
                </h3>
              ) : (
                <Field>
                  <Input
                    {...field}
                    id={field.name}
                    data-slot="type-name-input"
                    aria-invalid={fieldState.invalid}
                    onChange={(e) => {
                      field.onChange(e);
                      onNameChange?.(e.target.value);
                    }}
                    className="h-auto px-1 py-0.5 text-lg font-semibold"
                    placeholder={placeholder}
                    aria-label={nameAriaLabel}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )
            }
          />
        ) : (
          <h3 data-slot="type-name" className="truncate px-1 text-lg font-semibold">
            {name}
          </h3>
        )}
      </div>
      <KindBadge kind={kind} />
      {trailing}
    </div>
  );
}
