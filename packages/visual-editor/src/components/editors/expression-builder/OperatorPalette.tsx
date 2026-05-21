// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * OperatorPalette — categorized operator picker with context-aware filtering.
 *
 * Opens as a Popover (DS primitive) with an embedded Command for search and
 * keyboard navigation. Operators that don't match the current type context are
 * de-emphasized but still selectable.
 *
 * @module
 */

import { useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@rune-langium/design-system/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@rune-langium/design-system/ui/command';
import { OPERATOR_CATALOG } from './operator-catalog.js';
import type { OperatorDefinition } from './operator-catalog.js';
import type { ExpressionNode } from '../../../schemas/expression-node-schema.js';
import type { FilteredOperatorCategory, AnnotatedOperator } from '../../../hooks/useContextFilter.js';

export interface OperatorPaletteProps {
  open: boolean;
  onSelect: (node: ExpressionNode) => void;
  onClose: () => void;
  /** Context-filtered categories. If not provided, all operators are shown as recommended. */
  filteredCategories?: FilteredOperatorCategory[];
  /** Callback to open the reference picker from the palette. */
  onOpenReferencePicker?: () => void;
}

export function OperatorPalette({
  open,
  onSelect,
  onClose,
  filteredCategories,
  onOpenReferencePicker
}: OperatorPaletteProps) {
  const handleSelect = useCallback(
    (op: OperatorDefinition) => {
      const node = op.createNode(() => crypto.randomUUID());
      onSelect(node);
      onClose();
    },
    [onSelect, onClose]
  );

  // Use filtered categories if provided, otherwise default catalog (all recommended)
  const categories: FilteredOperatorCategory[] =
    filteredCategories ??
    OPERATOR_CATALOG.map((cat) => ({
      ...cat,
      operators: cat.operators.map((op) => ({ ...op, recommended: true }))
    }));

  return (
    <Popover
      open={open}
      onOpenChange={(isOpen: boolean) => {
        if (!isOpen) onClose();
      }}
    >
      {/*
       * Zero-size anchor trigger — the palette is opened programmatically by
       * the ExpressionBuilder (openPalette), not by user interaction with a
       * visible button. We use asChild on a hidden span to avoid a real button.
       */}
      <PopoverTrigger asChild>
        <span aria-hidden style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }} />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start" sideOffset={4} data-testid="operator-palette">
        <Command>
          <CommandInput placeholder="Search operators..." data-testid="palette-search" />
          <CommandList className="studio-scroll max-h-60">
            <CommandEmpty>No operators found.</CommandEmpty>
            {categories.map((category, idx) => {
              // Sort: recommended first, then non-recommended
              const sorted = [...category.operators].sort((a, b) => {
                if (a.recommended === b.recommended) return 0;
                return a.recommended ? -1 : 1;
              });

              return (
                <div key={category.id}>
                  {idx > 0 && <CommandSeparator />}
                  <CommandGroup heading={category.label}>
                    {sorted.map((op: AnnotatedOperator) => (
                      <CommandItem
                        key={`${op.$type}-${op.operator ?? op.label}`}
                        value={`${op.label} ${op.description}`}
                        onSelect={() => handleSelect(op)}
                        data-testid={`palette-option-${op.label}`}
                        data-recommended={op.recommended}
                        aria-label={`${op.label}${op.recommended ? '' : ' (not recommended for this context)'}`}
                        className={op.recommended ? '' : 'opacity-50'}
                      >
                        <span className="font-mono font-medium">{op.label}</span>
                        <span className="text-[10px] text-muted-foreground">{op.description}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </div>
              );
            })}
          </CommandList>
          {onOpenReferencePicker && (
            <>
              <CommandSeparator />
              <div className="p-1">
                <CommandItem
                  value="variable pick from scope"
                  onSelect={() => {
                    onOpenReferencePicker();
                    onClose();
                  }}
                  data-testid="palette-open-reference"
                >
                  <span className="font-mono font-medium">Variable</span>
                  <span className="text-[10px] text-muted-foreground">Pick from scope</span>
                </CommandItem>
              </div>
            </>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
