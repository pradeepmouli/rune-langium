// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InheritanceCell } from '../../../src/components/editors/structure/InheritanceCell.js';
import { TYPE_REF_PAYLOAD_MIME, type TypeRefPayload } from '../../../src/types/structure-view.js';

const { setInheritance } = vi.hoisted(() => ({ setInheritance: vi.fn() }));
vi.mock('../../../src/store/editor-store.js', () => ({
  useEditorStore: (selector: any) => selector({ setInheritance })
}));

describe('InheritanceCell', () => {
  beforeEach(() => setInheritance.mockReset());

  it('dispatches setInheritance on drop of Data payload', () => {
    const payload: TypeRefPayload = {
      rune: 'type-ref',
      namespaceUri: 'ns',
      typeId: 'NewBase',
      typeName: 'NewBase',
      kind: 'Data'
    };
    render(<InheritanceCell childId="Trade" extendsName="TradeBase" extendsNodeId="TradeBase" />);

    const el = screen.getByTestId('inheritance-cell');
    const dt = {
      types: [TYPE_REF_PAYLOAD_MIME],
      getData: vi.fn((m: string) => (m === TYPE_REF_PAYLOAD_MIME ? JSON.stringify(payload) : '')),
      dropEffect: 'none'
    };
    fireEvent.dragOver(el, { dataTransfer: dt });
    fireEvent.drop(el, { dataTransfer: dt });

    // setInheritance uses typeId (node id), not typeName
    expect(setInheritance).toHaveBeenCalledWith('Trade', 'NewBase');
  });

  it('does not activate isOver when disabled', () => {
    render(<InheritanceCell childId="Trade" extendsName="TradeBase" extendsNodeId="TradeBase" disabled />);
    const el = screen.getByTestId('inheritance-cell');
    fireEvent.dragOver(el, {
      dataTransfer: { types: [TYPE_REF_PAYLOAD_MIME], getData: vi.fn(), dropEffect: 'none' }
    });
    expect(el.className).not.toMatch(/--over/);
  });

  it('renders extendsNodeId as data-extends-id attribute', () => {
    render(<InheritanceCell childId="Trade" extendsName="TradeBase" extendsNodeId="ns.TradeBase" />);
    const el = screen.getByTestId('inheritance-cell');
    expect(el).toHaveAttribute('data-extends-id', 'ns.TradeBase');
  });
});
