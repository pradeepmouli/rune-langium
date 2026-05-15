// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { useCallback } from 'react';
import { useEditorStore, type EditorStore } from '../../../store/editor-store.js';
import { useTypeRefDrop } from '../../../hooks/useTypeRefDrop.js';
import type { TypeRefPayload } from '../../../types/structure-view.js';

export interface InheritanceCellProps {
  childId: string;
  extendsName?: string;
  extendsNodeId?: string;
  disabled?: boolean;
}

export function InheritanceCell({
  childId,
  extendsName,
  extendsNodeId,
  disabled
}: InheritanceCellProps): React.ReactElement {
  const setInheritance = useEditorStore((s: EditorStore) => s.setInheritance);

  const handleDrop = useCallback(
    (payload: TypeRefPayload) => {
      setInheritance(childId, payload.typeId);
    },
    [childId, setInheritance]
  );

  const { dragOverHandlers, isOver } = useTypeRefDrop({
    accept: disabled ? [] : ['Data'],
    onDrop: handleDrop
  });

  return (
    <span
      data-testid="inheritance-cell"
      data-extends-id={extendsNodeId}
      className={`rune-cell-extends${isOver && !disabled ? ' rune-cell-extends--over' : ''}`}
      {...dragOverHandlers}
    >
      <span className="rune-cell-extends-label">extends</span>
      {extendsName ? (
        <span className="rune-cell-extends-name">{extendsName}</span>
      ) : (
        <span className="rune-cell-extends-empty">(none)</span>
      )}
    </span>
  );
}
