// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TypePickerCell } from '../../../src/components/editors/structure/TypePickerCell.js';
import { TYPE_REF_PAYLOAD_MIME, type TypeRefPayload } from '../../../src/types/structure-view.js';

const { updateAttributeType } = vi.hoisted(() => ({ updateAttributeType: vi.fn() }));
vi.mock('../../../src/store/editor-store.js', () => ({
  useEditorStore: (selector: any) => selector({ updateAttributeType })
}));

describe('TypePickerCell', () => {
  beforeEach(() => updateAttributeType.mockReset());

  it('dispatches updateAttributeType on drop of an accepted payload, forwarding typeId for store-side validation/qualification', () => {
    const payload: TypeRefPayload = {
      rune: 'type-ref',
      namespaceUri: 'cdm.trade',
      typeId: 'cdm.trade::NewType',
      typeName: 'NewType',
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

    // Phase 13 / Finding 3: cell forwards the bare typeName AND the canonical
    // typeId so the store can validate existence and qualify against
    // cross-namespace ambiguity.
    expect(updateAttributeType).toHaveBeenCalledWith('Trade', 'economics', 'NewType', 'cdm.trade::NewType');
  });

  it('does not activate isOver when disabled', () => {
    render(<TypePickerCell typeName="Economics" typeKind="Data" nodeId="Trade" attrName="economics" disabled />);
    const row = screen.getByTestId('type-picker-cell');
    fireEvent.dragOver(row, {
      dataTransfer: { types: [TYPE_REF_PAYLOAD_MIME], getData: vi.fn(), dropEffect: 'none' }
    });
    expect(row.className).not.toMatch(/--over/);
  });

  // -----------------------------------------------------------------------
  // Choice context (Codex P2 PR #196 — silent-drop bug regression)
  // TypePickerCell is generic: it always forwards (nodeId, attrName, typeName, typeId)
  // to updateAttributeType. When mounted inside ChoiceNode, nodeId = choiceId and
  // attrName = arm.typeName. The store fix (Choice branch in updateAttributeType)
  // ensures these args produce the correct arm retype — the cell itself is unchanged.
  // -----------------------------------------------------------------------

  it('when mounted in a Choice arm context, forwards choiceId + armTypeName to updateAttributeType', () => {
    const payload: TypeRefPayload = {
      rune: 'type-ref',
      namespaceUri: 'payment',
      typeId: 'payment::WirePayment',
      typeName: 'WirePayment',
      kind: 'Data'
    };
    // Simulate ChoiceNode's props: nodeId = canonical Choice id, attrName = arm.typeName.
    render(
      <TypePickerCell typeName="CashPayment" typeKind="Data" nodeId="payment::PaymentMethod" attrName="CashPayment" />
    );

    const row = screen.getByTestId('type-picker-cell');
    const dt = {
      types: [TYPE_REF_PAYLOAD_MIME],
      getData: vi.fn((mime: string) => (mime === TYPE_REF_PAYLOAD_MIME ? JSON.stringify(payload) : '')),
      dropEffect: 'none'
    };
    fireEvent.dragOver(row, { dataTransfer: dt });
    fireEvent.drop(row, { dataTransfer: dt });

    // The cell must pass the canonical Choice node id and the arm typeName
    // as attrName — the store's Choice branch matches by typeCall.$refText.
    expect(updateAttributeType).toHaveBeenCalledWith(
      'payment::PaymentMethod', // choiceId
      'CashPayment', // attrName = arm.typeName (old type ref)
      'WirePayment', // newTypeName
      'payment::WirePayment' // typeId for validation + disambiguation
    );
  });
});
