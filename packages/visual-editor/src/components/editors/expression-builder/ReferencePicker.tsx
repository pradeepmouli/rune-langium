// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * ReferencePicker — dropdown to select in-scope variables.
 *
 * Shows FunctionScope entries (inputs, aliases, output) with type/cardinality.
 * Uses the design-system Select for keyboard navigation and accessible
 * listbox semantics.
 *
 * @module
 */

import { Select, SelectContent, SelectItem, SelectTrigger } from '@rune-langium/design-system/ui/select';
import type { ExpressionNode } from '../../../schemas/expression-node-schema.js';
import type { FunctionScope, FunctionScopeEntry } from '../../../store/expression-store.js';

export interface ReferencePickerProps {
  open: boolean;
  scope: FunctionScope;
  onSelect: (node: ExpressionNode) => void;
  onClose: () => void;
}

export function ReferencePicker({ open, scope, onSelect, onClose }: ReferencePickerProps) {
  const allEntries = [
    ...scope.inputs.map((e) => ({ ...e, origin: 'input' as const })),
    ...(scope.output ? [{ ...scope.output, origin: 'output' as const }] : []),
    ...scope.aliases.map((e) => ({ ...e, origin: 'alias' as const }))
  ];
  const handleValueChange = (value: string) => {
    const entry: FunctionScopeEntry | undefined = allEntries.find(({ origin, name }) => `${origin}:${name}` === value);
    if (!entry) return;
    onSelect({
      $type: 'RosettaSymbolReference',
      id: crypto.randomUUID(),
      symbol: entry.name
    } as unknown as ExpressionNode);
  };

  return (
    <Select
      open={open}
      value={null}
      onValueChange={handleValueChange}
      onOpenChange={(isOpen: boolean) => {
        if (!isOpen) onClose();
      }}
    >
      {/*
       * Zero-size anchor — opened programmatically by ExpressionBuilder,
       * not by direct user interaction on a visible button.
       */}
      <SelectTrigger
        nativeButton={false}
        render={<span aria-hidden style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }} />}
      />
      <SelectContent className="w-56 p-0" align="start" data-testid="reference-picker">
        {allEntries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No variables in scope</p>
        ) : null}
        {allEntries.map((entry) => (
          <SelectItem
            key={`${entry.origin}-${entry.name}`}
            value={`${entry.origin}:${entry.name}`}
            data-testid={`ref-option-${entry.name}`}
          >
            <span className="font-mono font-medium">{entry.name}</span>
            {entry.typeName && <span className="text-3xs text-muted-foreground">{entry.typeName}</span>}
            {entry.cardinality && (
              <span className="rounded bg-muted px-1 text-3xs text-muted-foreground">{entry.cardinality}</span>
            )}
            <span className="ml-auto rounded bg-muted px-1 text-3xs text-muted-foreground">{entry.origin}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
