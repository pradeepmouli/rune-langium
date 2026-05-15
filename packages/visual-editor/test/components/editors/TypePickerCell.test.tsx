// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TypePickerCell } from '../../../src/components/editors/structure/TypePickerCell.js';
import { TYPE_REF_PAYLOAD_MIME, type TypeRefPayload } from '../../../src/types/structure-view.js';

const updateAttributeType = vi.fn();
vi.mock('../../../src/store/editor-store.js', () => ({
  useEditorStore: (selector: (s: { updateAttributeType: typeof updateAttributeType }) => unknown) =>
    selector({ updateAttributeType })
}));

describe('TypePickerCell', () => {
  beforeEach(() => updateAttributeType.mockReset());

  it('renders the current type as a chip with the kind class', () => {
    render(<TypePickerCell typeName="Economics" typeKind="Data" nodeId="Trade" attrName="economics" />);
    const chip = screen.getByText('Economics');
    expect(chip).toBeInTheDocument();
    expect(chip.className).toMatch(/rune-cell-type-chip/);
    expect(chip.className).toMatch(/--data/);
  });

  it('dispatches updateAttributeType on drop of an accepted payload', () => {
    const payload: TypeRefPayload = {
      rune: 'type-ref',
      namespaceUri: 'cdm.trade',
      typeId: 'NewType',
      kind: 'Data'
    };
    render(<TypePickerCell typeName="Economics" typeKind="Data" nodeId="Trade" attrName="economics" />);

    const row = screen.getByTestId('type-picker-cell');
    const dt = {
      types: [TYPE_REF_PAYLOAD_MIME],
      getData: vi.fn((mime: string) => (mime === TYPE_REF_PAYLOAD_MIME ? JSON.stringify(payload) : '')),
      dropEffect: 'none'
    };
    fireEvent.dragOver(row, { dataTransfer: dt });
    fireEvent.drop(row, { dataTransfer: dt });

    expect(updateAttributeType).toHaveBeenCalledWith('Trade', 'economics', 'NewType');
  });
});
