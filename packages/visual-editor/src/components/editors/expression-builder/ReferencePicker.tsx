// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * ReferencePicker — dropdown to select in-scope variables.
 *
 * Shows FunctionScope entries (inputs, aliases, output) with type/cardinality.
 * Uses DS Popover + Command for keyboard navigation and accessible listbox
 * semantics.
 *
 * @module
 */

import { useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@rune-langium/design-system/ui/popover';
import { Command, CommandEmpty, CommandItem, CommandList } from '@rune-langium/design-system/ui/command';
import type { ExpressionNode } from '../../../schemas/expression-node-schema.js';
import type { FunctionScope, FunctionScopeEntry } from '../../../store/expression-store.js';

export interface ReferencePickerProps {
  open: boolean;
  scope: FunctionScope;
  onSelect: (node: ExpressionNode) => void;
  onClose: () => void;
}

export function ReferencePicker({ open, scope, onSelect, onClose }: ReferencePickerProps) {
  const handleSelect = useCallback(
    (entry: FunctionScopeEntry) => {
      const node = {
        $type: 'RosettaSymbolReference',
        id: crypto.randomUUID(),
        symbol: entry.name
      } as unknown as ExpressionNode;
      onSelect(node);
      onClose();
    },
    [onSelect, onClose]
  );

  const allEntries = [
    ...scope.inputs.map((e) => ({ ...e, origin: 'input' as const })),
    ...(scope.output ? [{ ...scope.output, origin: 'output' as const }] : []),
    ...scope.aliases.map((e) => ({ ...e, origin: 'alias' as const }))
  ];

  return (
    <Popover
      open={open}
      onOpenChange={(isOpen: boolean) => {
        if (!isOpen) onClose();
      }}
    >
      {/*
       * Zero-size anchor — opened programmatically by ExpressionBuilder,
       * not by direct user interaction on a visible button.
       */}
      <PopoverTrigger
        nativeButton={false}
        render={<span aria-hidden style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }} />}
      />
      <PopoverContent className="w-56 p-0" align="start" sideOffset={4} data-testid="reference-picker">
        <Command>
          <CommandList>
            <CommandEmpty>No variables in scope</CommandEmpty>
            {allEntries.map((entry) => (
              <CommandItem
                key={`${entry.origin}-${entry.name}`}
                value={`${entry.name} ${entry.typeName ?? ''}`}
                onSelect={() => handleSelect(entry)}
                data-testid={`ref-option-${entry.name}`}
              >
                <span className="font-mono font-medium">{entry.name}</span>
                {entry.typeName && <span className="text-[10px] text-muted-foreground">{entry.typeName}</span>}
                {entry.cardinality && (
                  <span className="rounded bg-muted px-1 text-[9px] text-muted-foreground">{entry.cardinality}</span>
                )}
                <span className="ml-auto rounded bg-muted px-1 text-[9px] text-muted-foreground">{entry.origin}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
