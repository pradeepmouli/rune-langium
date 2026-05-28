// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CardinalityCell } from '../../../src/components/editors/structure/CardinalityCell.js';

const { updateCardinality } = vi.hoisted(() => ({ updateCardinality: vi.fn() }));
const { pickerProps } = vi.hoisted(() => ({
  pickerProps: { current: null as null | Record<string, unknown> }
}));

vi.mock('../../../src/store/editor-store.js', () => ({
  useEditorStore: (selector: any) => selector({ updateCardinality })
}));
vi.mock('../../../src/components/editors/CardinalityPicker.js', () => ({
  CardinalityPicker: (props: {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    wrapperClassName?: string;
    triggerClassName?: string;
    contentClassName?: string;
    inputClassName?: string;
  }) => {
    pickerProps.current = props;
    return (
      <div data-testid="mock-cardinality-picker">
        <button type="button" onClick={() => props.onChange('(1..1)')}>
          preset
        </button>
        <button type="button" onClick={() => props.onChange('(0..1)')}>
          same
        </button>
        <button type="button" onClick={() => props.onChange('(2..3)')}>
          custom
        </button>
      </div>
    );
  }
}));

describe('CardinalityCell', () => {
  beforeEach(() => {
    updateCardinality.mockReset();
    pickerProps.current = null;
  });

  it('normalizes the structure-view value before passing it to the shared picker', () => {
    render(<CardinalityCell value="0..1" nodeId="Trade" attrName="tradeDate" />);

    expect(pickerProps.current).toMatchObject({
      value: '(0..1)',
      wrapperClassName: 'inline-flex'
    });
  });

  it('dispatches updateCardinality when a new preset is selected', () => {
    render(<CardinalityCell value="0..1" nodeId="Trade" attrName="tradeDate" />);

    fireEvent.click(screen.getByRole('button', { name: 'preset' }));

    expect(updateCardinality).toHaveBeenCalledWith('Trade', 'tradeDate', '1..1');
  });

  it('does not dispatch when the same value is selected', () => {
    render(<CardinalityCell value="0..1" nodeId="Trade" attrName="tradeDate" />);

    fireEvent.click(screen.getByRole('button', { name: 'same' }));

    expect(updateCardinality).not.toHaveBeenCalled();
  });

  it('strips display parentheses before dispatching custom values to the store', () => {
    render(<CardinalityCell value="0..1" nodeId="Trade" attrName="tradeDate" />);

    fireEvent.click(screen.getByRole('button', { name: 'custom' }));

    expect(updateCardinality).toHaveBeenCalledWith('Trade', 'tradeDate', '2..3');
  });
});
