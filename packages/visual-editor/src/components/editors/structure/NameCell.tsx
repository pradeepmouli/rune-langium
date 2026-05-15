// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { useState, useCallback, useRef, useEffect } from 'react';
import { useEditorStore, type EditorStore } from '../../../store/editor-store.js';

export interface NameCellProps {
  value: string;
  nodeId: string;
  attrName: string;
  disabled?: boolean;
}

export function NameCell({ value, nodeId, attrName, disabled }: NameCellProps): React.ReactElement {
  const renameAttribute = useEditorStore((s: EditorStore) => s.renameAttribute);
  const [editing, setEditing] = useState(false);
  // draft is initialised from value; synced via useEffect when value changes
  // externally while NOT editing (avoids clobbering an in-progress edit).
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  // Sync external value changes into draft only when not actively editing.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  const commit = useCallback(() => {
    setEditing(false);
    if (draft && draft !== value) {
      renameAttribute(nodeId, attrName, draft);
    } else {
      // no-op: restore draft in case it was blanked
      setDraft(value);
    }
  }, [draft, value, nodeId, attrName, renameAttribute]);

  const revert = useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  if (editing) {
    return (
      <input
        ref={ref}
        className="rune-cell-editor"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            // Prevent onBlur from also firing commit (blur fires after keydown).
            // We call commit here; onBlur will see editing=false and be a no-op
            // because setEditing(false) inside commit closes the input before blur fires.
            commit();
          } else if (e.key === 'Escape') {
            // revert sets editing=false, so onBlur fires on a non-existent input
            // (the component switches to display mode). No double-dispatch risk.
            revert();
          }
        }}
      />
    );
  }

  return (
    <span
      className="rune-cell-name"
      onClick={() => !disabled && setEditing(true)}
      role={disabled ? undefined : 'button'}
      tabIndex={disabled ? undefined : 0}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) setEditing(true);
      }}
    >
      {value}
    </span>
  );
}
