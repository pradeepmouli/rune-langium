// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * SourceRefField — single cross-reference picker for a synonym source.
 *
 * Mirrors TypeReferenceField's chip+popover idiom but is NOT type-coupled: it
 * picks a `RosettaSynonymSource` from a flat option list (no type kinds, drop
 * target, namespace tree, or node navigation). Built on the shared design-system
 * Popover + cmdk Command primitives.
 */

import { useCallback, useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@rune-langium/design-system/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@rune-langium/design-system/ui/command';
import type { SourceRefOption } from '../../types.js';

export interface SourceRefFieldProps {
  value: string | null;
  options: SourceRefOption[];
  onSelect: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
}

export function SourceRefField({
  value,
  options,
  onSelect,
  placeholder = 'Select source…',
  disabled = false,
  readOnly = false
}: SourceRefFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);
  const label = selected?.label ?? '';

  const handleSelect = useCallback(
    (v: string) => {
      onSelect(v);
      setOpen(false);
    },
    [onSelect]
  );

  if (readOnly) {
    return (
      <span
        data-slot="source-ref"
        className="inline-flex items-center rounded bg-card px-2 py-0.5 text-xs text-foreground"
      >
        {label || placeholder}
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <button
            type="button"
            data-slot="source-ref-trigger"
            className="nodrag nopan inline-flex items-center rounded bg-card px-2 py-0.5 text-xs text-foreground"
          >
            {label || placeholder}
          </button>
        }
      />
      <PopoverContent align="start" sideOffset={4} className="w-auto p-0">
        <Command className="nodrag nopan">
          <CommandInput placeholder="Search sources…" />
          <CommandList>
            <CommandEmpty>No synonym sources.</CommandEmpty>
            {options.map((o) => (
              <CommandItem key={o.value} value={o.label} onSelect={() => handleSelect(o.value)}>
                {o.label}
                {o.namespace ? <span className="ml-2 text-muted-foreground">{o.namespace}</span> : null}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
