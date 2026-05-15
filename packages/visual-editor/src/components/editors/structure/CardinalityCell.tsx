// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { useState, useCallback, useRef, useEffect } from 'react';
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
  const wrapRef = useRef<HTMLSpanElement>(null);

  // Close menu when clicking outside the wrapper.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const choose = useCallback(
    (next: string) => {
      setOpen(false);
      if (next !== value) updateCardinality(nodeId, attrName, next);
    },
    [value, nodeId, attrName, updateCardinality]
  );

  return (
    <span ref={wrapRef} className="rune-cell-card-wrap">
      <button
        className="rune-cell-card"
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((prev) => !prev)}
      >
        {value}
      </button>
      {open && (
        // TODO(Phase 10): keyboard nav (arrow keys, Enter, Escape)
        <ul className="rune-cell-card-menu" role="menu">
          {PRESETS.map((preset) => (
            <li key={preset}>
              <button type="button" role="menuitem" aria-current={preset === value} onClick={() => choose(preset)}>
                {preset}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
