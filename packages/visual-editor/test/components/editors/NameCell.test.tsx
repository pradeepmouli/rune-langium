// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NameCell } from '../../../src/components/editors/structure/NameCell.js';

const { renameAttribute } = vi.hoisted(() => ({ renameAttribute: vi.fn() }));

vi.mock('../../../src/store/editor-store.js', () => ({
  useEditorStore: (selector: any) => selector({ renameAttribute })
}));

describe('NameCell', () => {
  beforeEach(() => {
    renameAttribute.mockReset();
  });

  it('switches to an input on click', () => {
    render(<NameCell value="tradeDate" nodeId="Trade" attrName="tradeDate" />);
    fireEvent.click(screen.getByText('tradeDate'));
    expect(screen.getByRole('textbox')).toHaveValue('tradeDate');
  });

  it('dispatches renameAttribute on Enter when value changed', () => {
    render(<NameCell value="tradeDate" nodeId="Trade" attrName="tradeDate" />);
    fireEvent.click(screen.getByText('tradeDate'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'executionDate' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(renameAttribute).toHaveBeenCalledWith('Trade', 'tradeDate', 'executionDate');
  });

  it('does not dispatch when value unchanged', () => {
    render(<NameCell value="tradeDate" nodeId="Trade" attrName="tradeDate" />);
    fireEvent.click(screen.getByText('tradeDate'));
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(renameAttribute).not.toHaveBeenCalled();
  });

  it('reverts on Escape', () => {
    render(<NameCell value="tradeDate" nodeId="Trade" attrName="tradeDate" />);
    fireEvent.click(screen.getByText('tradeDate'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'oops' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(renameAttribute).not.toHaveBeenCalled();
    expect(screen.getByText('tradeDate')).toBeInTheDocument();
  });
});
