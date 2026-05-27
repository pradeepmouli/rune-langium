// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { useCallback } from 'react';
import { CardinalityPicker } from '../CardinalityPicker.js';
import { useEditorStore, type EditorStore } from '../../../store/editor-store.js';

export interface CardinalityCellProps {
  value: string;
  nodeId: string;
  attrName: string;
  disabled?: boolean;
}

export function CardinalityCell({ value, nodeId, attrName, disabled }: CardinalityCellProps): React.ReactElement {
  const updateCardinality = useEditorStore((s: EditorStore) => s.updateCardinality);

  const handleChange = useCallback(
    (next: string) => {
      const normalized = next.replace(/[()]/g, '').trim();
      if (normalized !== value) updateCardinality(nodeId, attrName, normalized);
    },
    [value, nodeId, attrName, updateCardinality]
  );

  return (
    <span className="rune-cell-card-wrap">
      <CardinalityPicker
        value={value.startsWith('(') ? value : `(${value})`}
        onChange={handleChange}
        disabled={disabled}
        wrapperClassName="inline-flex"
        triggerClassName="rune-cell-card h-auto min-w-0 border-0 bg-muted px-[var(--rune-pill-padding-x)] py-[var(--rune-chip-padding-y)] text-[11px] text-muted-foreground shadow-none focus-visible:ring-1 focus-visible:ring-ring"
        contentClassName="min-w-[5rem]"
        inputClassName="w-[4rem]"
      />
    </span>
  );
}
