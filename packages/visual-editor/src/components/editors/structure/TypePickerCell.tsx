// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { useCallback } from 'react';
import { useEditorStore, type EditorStore } from '../../../store/editor-store.js';
import { useTypeRefDrop } from '../../../hooks/useTypeRefDrop.js';
import type { TypeRefPayload } from '../../../types/structure-view.js';

export interface TypePickerCellProps {
  typeName: string;
  typeKind: 'Data' | 'Choice' | 'Enum' | 'BasicType' | 'Unresolved';
  nodeId: string;
  attrName: string;
  disabled?: boolean;
}

const KIND_CLASS: Record<TypePickerCellProps['typeKind'], string> = {
  Data: 'rune-cell-type-chip--data',
  Choice: 'rune-cell-type-chip--choice',
  Enum: 'rune-cell-type-chip--enum',
  BasicType: 'rune-cell-type-chip--basic',
  Unresolved: 'rune-cell-type-chip--unresolved'
};

export function TypePickerCell({
  typeName,
  typeKind,
  nodeId,
  attrName,
  disabled
}: TypePickerCellProps): React.ReactElement {
  const updateAttributeType = useEditorStore((s: EditorStore) => s.updateAttributeType);

  const handleDrop = useCallback(
    (payload: TypeRefPayload) => {
      updateAttributeType(nodeId, attrName, payload.typeName);
    },
    [nodeId, attrName, updateAttributeType]
  );

  const { dragOverHandlers, isOver } = useTypeRefDrop({
    accept: disabled ? [] : ['Data', 'Choice', 'Enum', 'BasicType'],
    onDrop: handleDrop
  });

  return (
    <span
      data-testid="type-picker-cell"
      className={`rune-cell-type-wrap${isOver && !disabled ? ' rune-cell-type-wrap--over' : ''}`}
      {...dragOverHandlers}
    >
      <button type="button" disabled={disabled} className={`rune-cell-type-chip ${KIND_CLASS[typeKind]}`}>
        {typeName}
      </button>
    </span>
  );
}
