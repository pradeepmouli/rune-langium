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
  CommandSeparator,
  type CommandEntry
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

type PaletteCommand =
  | { readonly kind: 'operator'; readonly operator: AnnotatedOperator }
  | { readonly kind: 'reference' };

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

  const commandCategories = categories.map((category) => ({
    ...category,
    items: [...category.operators]
      .sort((a, b) => Number(b.recommended) - Number(a.recommended))
      .map<CommandEntry<PaletteCommand>>((operator) => ({
        value: { kind: 'operator', operator },
        label: operator.label,
        searchText: `${operator.label} ${operator.description}`
      }))
  }));
  const referenceItem: CommandEntry<PaletteCommand> | undefined = onOpenReferencePicker
    ? { value: { kind: 'reference' }, label: 'Variable', searchText: 'variable pick from scope' }
    : undefined;
  const commandGroups = [...commandCategories, ...(referenceItem ? [{ id: 'reference', items: [referenceItem] }] : [])];

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
       * visible button.
       */}
      <PopoverTrigger
        nativeButton={false}
        render={<span aria-hidden style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }} />}
      />
      <PopoverContent className="w-64 p-0" align="start" sideOffset={4} data-testid="operator-palette">
        <Command
          items={commandGroups}
          onItemSelect={(command) => {
            if (command.kind === 'reference') {
              onOpenReferencePicker?.();
              onClose();
              return;
            }
            handleSelect(command.operator);
          }}
        >
          <CommandInput
            aria-label="Search operators"
            placeholder="Search operators..."
            data-testid="palette-search"
            autoFocus
          />
          <CommandList className="studio-scroll max-h-60">
            <CommandEmpty>No operators found.</CommandEmpty>
            {commandCategories.map((category, idx) => {
              return (
                <div key={category.id}>
                  {idx > 0 && <CommandSeparator />}
                  <CommandGroup<PaletteCommand> id={category.id} heading={category.label}>
                    {(item) => {
                      const operator = item.value.kind === 'operator' ? item.value.operator : null;
                      if (!operator) return null;
                      return (
                        <CommandItem
                          key={`${operator.$type}-${operator.operator ?? operator.label}`}
                          value={item}
                          data-testid={`palette-option-${operator.label}`}
                          data-recommended={operator.recommended}
                          aria-label={`${operator.label}${operator.recommended ? '' : ' (not recommended for this context)'}`}
                          className={operator.recommended ? '' : 'opacity-50'}
                        >
                          <span className="font-mono font-medium">{operator.label}</span>
                          <span className="text-3xs text-muted-foreground">{operator.description}</span>
                        </CommandItem>
                      );
                    }}
                  </CommandGroup>
                </div>
              );
            })}
            {referenceItem ? (
              <>
                <CommandSeparator />
                <CommandGroup<PaletteCommand> id="reference">
                  {(item) => (
                    <CommandItem value={item} data-testid="palette-open-reference">
                      <span className="font-mono font-medium">Variable</span>
                      <span className="text-3xs text-muted-foreground">Pick from scope</span>
                    </CommandItem>
                  )}
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
