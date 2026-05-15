// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CardinalityCell } from '../../../src/components/editors/structure/CardinalityCell.js';

const updateCardinality = vi.fn();
vi.mock('../../../src/store/editor-store.js', () => ({
  useEditorStore: (selector: (s: { updateCardinality: typeof updateCardinality }) => unknown) =>
    selector({ updateCardinality })
}));

describe('CardinalityCell', () => {
  beforeEach(() => updateCardinality.mockReset());

  it('displays the formatted cardinality as a pill', () => {
    render(<CardinalityCell value="0..*" nodeId="Trade" attrName="economics" />);
    expect(screen.getByText('0..*')).toBeInTheDocument();
  });

  it('dispatches updateCardinality when a new value is selected', () => {
    render(<CardinalityCell value="0..1" nodeId="Trade" attrName="tradeDate" />);
    fireEvent.click(screen.getByText('0..1'));
    fireEvent.click(screen.getByText('1..1'));
    expect(updateCardinality).toHaveBeenCalledWith('Trade', 'tradeDate', '1..1');
  });

  it('does not dispatch when the same value is clicked', () => {
    render(<CardinalityCell value="0..1" nodeId="Trade" attrName="tradeDate" />);
    fireEvent.click(screen.getByText('0..1'));
    const items = screen.getAllByText('0..1');
    fireEvent.click(items[items.length - 1]);
    expect(updateCardinality).not.toHaveBeenCalled();
  });
});
