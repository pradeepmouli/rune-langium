// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * OperatorPalette — categorized operator picker with context-aware filtering.
 *
 * Opens as a popover anchored to a clicked placeholder. Provides
 * fuzzy search and categorized groups. Operators that don't match
 * the current type context are de-emphasized but still selectable.
 *
 * @module
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { OPERATOR_CATALOG } from './operator-catalog.js';
import type { OperatorDefinition } from './operator-catalog.js';
import type { ExpressionNode } from '../../../schemas/expression-node-schema.js';
import type {
  FilteredOperatorCategory,
  AnnotatedOperator
} from '../../../hooks/useContextFilter.js';

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
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleSelect = useCallback(
    (op: OperatorDefinition) => {
      const node = op.createNode(() => crypto.randomUUID());
      onSelect(node);
      onClose();
    },
    [onSelect, onClose]
  );

  if (!open) return null;

  const lowerSearch = search.toLowerCase();

  // Use filtered categories if provided, otherwise default catalog (all recommended)
  const categories: FilteredOperatorCategory[] =
    filteredCategories ??
    OPERATOR_CATALOG.map((cat) => ({
      ...cat,
      operators: cat.operators.map((op) => ({ ...op, recommended: true }))
    }));

  return (
    <div
      className="absolute z-50 w-64 rounded-md border border-border bg-popover p-1 shadow-lg"
      data-testid="operator-palette"
      role="listbox"
    >
      <input
        ref={inputRef}
        className="mb-1 w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        placeholder="Search operators..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        data-testid="palette-search"
      />
      <div className="max-h-60 overflow-y-auto">
        {categories.map((category) => {
          const filtered = category.operators.filter(
            (op) =>
              !search ||
              op.label.toLowerCase().includes(lowerSearch) ||
              op.description.toLowerCase().includes(lowerSearch)
          );
          if (filtered.length === 0) return null;

          // Sort: recommended first, then non-recommended
          const sorted = [...filtered].sort((a, b) => {
            if (a.recommended === b.recommended) return 0;
            return a.recommended ? -1 : 1;
          });

          return (
            <div key={category.id} className="mb-1">
              <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {category.label}
              </div>
              {sorted.map((op: AnnotatedOperator) => (
                <button
                  key={`${op.$type}-${op.operator ?? op.label}`}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent focus:bg-accent focus:outline-none ${
                    op.recommended ? 'text-foreground' : 'text-muted-foreground/50 opacity-50'
                  }`}
                  onClick={() => handleSelect(op)}
                  role="option"
                  data-testid={`palette-option-${op.label}`}
                  data-recommended={op.recommended}
                  aria-label={`${op.label}${op.recommended ? '' : ' (not recommended for this context)'}`}
                >
                  <span className="font-mono font-medium">{op.label}</span>
                  <span className="text-[10px] text-muted-foreground">{op.description}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
      {onOpenReferencePicker && (
        <button
          className="mt-1 flex w-full items-center gap-2 rounded border-t border-border px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent focus:bg-accent focus:outline-none"
          onClick={onOpenReferencePicker}
          data-testid="palette-open-reference"
        >
          <span className="font-mono font-medium">Variable</span>
          <span className="text-[10px] text-muted-foreground">Pick from scope</span>
        </button>
      )}
    </div>
  );
}
