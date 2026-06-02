// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { useCallback } from 'react';
import { useEditorStore, type EditorStore } from '../../../store/editor-store.js';
import { useTypeRefDrop } from '../../../hooks/useTypeRefDrop.js';
import type { TypeRefPayload } from '../../../types/structure-view.js';
import { TypeChip } from './TypeChip.js';
import type { TypeChipKind } from './TypeChip.js';

export interface TypePickerCellProps {
  typeName: string;
  typeKind: TypeChipKind;
  nodeId: string;
  attrName: string;
  disabled?: boolean;
}

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
      // Phase 13 / Finding 3: pass payload.typeId so the store can validate
      // existence AND qualify the $refText against same-named types in
      // other namespaces. Without typeId the store falls back to the legacy
      // bare-name write which corrupts cross-namespace references in
      // multi-namespace workspaces (CDM, FpML).
      updateAttributeType(nodeId, attrName, payload.typeName, payload.typeId);
    },
    [nodeId, attrName, updateAttributeType]
  );

  const { dragOverHandlers, isOver } = useTypeRefDrop({
    accept: disabled ? [] : ['Data', 'Choice', 'Enum', 'BasicType', 'Record', 'TypeAlias'],
    onDrop: handleDrop
  });

  return (
    <span
      data-testid="type-picker-cell"
      className={`rune-cell-type-wrap${isOver && !disabled ? ' rune-cell-type-wrap--over' : ''}`}
      {...dragOverHandlers}
    >
      <TypeChip typeName={typeName} typeKind={typeKind} disabled={disabled} />
    </span>
  );
}
