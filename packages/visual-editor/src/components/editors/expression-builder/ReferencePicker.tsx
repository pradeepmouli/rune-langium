// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * ReferencePicker — dropdown to select in-scope variables.
 *
 * Shows FunctionScope entries (inputs, aliases, output) with type/cardinality.
 *
 * @module
 */

import { useCallback } from 'react';
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

  if (!open) return null;

  const allEntries = [
    ...scope.inputs.map((e) => ({ ...e, origin: 'input' as const })),
    ...(scope.output ? [{ ...scope.output, origin: 'output' as const }] : []),
    ...scope.aliases.map((e) => ({ ...e, origin: 'alias' as const }))
  ];

  return (
    <div
      className="absolute z-50 w-56 rounded-md border border-border bg-popover p-1 shadow-lg"
      data-testid="reference-picker"
      role="listbox"
    >
      {allEntries.length === 0 && (
        <div className="px-2 py-2 text-xs text-muted-foreground">No variables in scope</div>
      )}
      {allEntries.map((entry) => (
        <button
          key={`${entry.origin}-${entry.name}`}
          className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-foreground hover:bg-accent focus:bg-accent focus:outline-none"
          onClick={() => handleSelect(entry)}
          role="option"
          data-testid={`ref-option-${entry.name}`}
        >
          <span className="font-mono font-medium">{entry.name}</span>
          {entry.typeName && (
            <span className="text-[10px] text-muted-foreground">{entry.typeName}</span>
          )}
          {entry.cardinality && (
            <span className="rounded bg-muted px-1 text-[9px] text-muted-foreground">
              {entry.cardinality}
            </span>
          )}
          <span className="ml-auto rounded bg-muted px-1 text-[9px] text-muted-foreground">
            {entry.origin}
          </span>
        </button>
      ))}
    </div>
  );
}
