/**
 * OperatorPalette — categorized operator picker using cmdk.
 *
 * Opens as a popover anchored to a clicked placeholder. Provides
 * fuzzy search and categorized groups.
 *
 * @module
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { OPERATOR_CATALOG } from './operator-catalog.js';
import type { OperatorDefinition } from './operator-catalog.js';
import type { ExpressionNode } from '../../../schemas/expression-node-schema.js';

export interface OperatorPaletteProps {
  open: boolean;
  anchorEl?: HTMLElement | null;
  onSelect: (node: ExpressionNode) => void;
  onClose: () => void;
}

export function OperatorPalette({ open, onSelect, onClose }: OperatorPaletteProps) {
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
        {OPERATOR_CATALOG.map((category) => {
          const filtered = category.operators.filter(
            (op) =>
              !search ||
              op.label.toLowerCase().includes(lowerSearch) ||
              op.description.toLowerCase().includes(lowerSearch)
          );
          if (filtered.length === 0) return null;
          return (
            <div key={category.id} className="mb-1">
              <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {category.label}
              </div>
              {filtered.map((op) => (
                <button
                  key={`${op.$type}-${op.operator ?? op.label}`}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-foreground hover:bg-accent focus:bg-accent focus:outline-none"
                  onClick={() => handleSelect(op)}
                  role="option"
                  data-testid={`palette-option-${op.label}`}
                >
                  <span className="font-mono font-medium">{op.label}</span>
                  <span className="text-[10px] text-muted-foreground">{op.description}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
