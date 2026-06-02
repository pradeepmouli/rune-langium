// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * DefinitionField — Read-only labelled "Definition" field.
 *
 * Renders a two-row stack: a muted label and the definition text below it.
 * Intended for the read-only panel surfaces (OtherForm and any future
 * read-only form that needs to show a `definition` string).
 *
 * @module
 */

export interface DefinitionFieldProps {
  /** The definition text to display. */
  value: string;
  /** Additional CSS classes applied to the wrapper div. */
  className?: string;
}

export function DefinitionField({ value, className }: DefinitionFieldProps) {
  return (
    <div data-slot="definition-field" className={`flex flex-col gap-0.5${className ? ` ${className}` : ''}`}>
      <span className="text-xs font-medium text-muted-foreground">Definition</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
