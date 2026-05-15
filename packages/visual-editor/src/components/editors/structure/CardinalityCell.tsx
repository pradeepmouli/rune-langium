// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { useState, useCallback } from 'react';
import { useEditorStore, type EditorStore } from '../../../store/editor-store.js';

const PRESETS = ['0..1', '1..1', '0..*', '1..*', '2..2'] as const;

export interface CardinalityCellProps {
  value: string;
  nodeId: string;
  attrName: string;
  disabled?: boolean;
}

export function CardinalityCell({ value, nodeId, attrName, disabled }: CardinalityCellProps): React.ReactElement {
  const updateCardinality = useEditorStore((s: EditorStore) => s.updateCardinality);
  const [open, setOpen] = useState(false);

  const choose = useCallback(
    (next: string) => {
      setOpen(false);
      if (next !== value) updateCardinality(nodeId, attrName, next);
    },
    [value, nodeId, attrName, updateCardinality]
  );

  return (
    <span className="rune-cell-card-wrap">
      <button
        className="rune-cell-card"
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((prev) => !prev)}
      >
        {value}
      </button>
      {open && (
        <ul className="rune-cell-card-menu" role="listbox">
          {PRESETS.map((preset) => (
            <li key={preset} role="option" aria-selected={preset === value}>
              <button type="button" onClick={() => choose(preset)}>
                {preset}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
