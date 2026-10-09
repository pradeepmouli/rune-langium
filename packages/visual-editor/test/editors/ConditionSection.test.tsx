// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConditionSection } from '../../src/components/editors/ConditionSection.js';

const first = { $type: 'Condition', name: 'First', expression: { text: 'x > 0' } };
const second = { $type: 'Condition', name: 'Second', expression: { text: 'x < 10' } };

describe('compact data rules', () => {
  it('mounts one editor with an explicit target and keeps the selected rule across reorder', () => {
    const editor = vi.fn((props) => (
      <div data-testid="active-expression">
        {props.target.index}:{props.value}
      </div>
    ));
    const props = { nodeId: 'test.Trade', compact: true, renderExpressionEditor: editor, onReorder: vi.fn() };
    const { rerender } = render(<ConditionSection {...props} conditions={[first, second]} />);
    expect(screen.getAllByTestId('active-expression')).toHaveLength(1);
    fireEvent.click(screen.getByRole('tab', { name: 'Second' }));
    expect(editor).toHaveBeenLastCalledWith(
      expect.objectContaining({ target: { nodeId: 'test.Trade', kind: 'precondition', index: 1 } })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Move condition up' }));
    expect(props.onReorder).toHaveBeenCalledWith(1, 0);
    rerender(<ConditionSection {...props} conditions={[second, first]} />);
    expect(screen.getByLabelText('Condition name')).toHaveValue('Second');
    expect(screen.getAllByTestId('active-expression')).toHaveLength(1);
  });

  it('selects a remaining rule after removing the active one', () => {
    const editor = (props: { value: string }) => <div data-testid="active-expression">{props.value}</div>;
    const props = { nodeId: 'test.Trade', compact: true, renderExpressionEditor: editor, onRemove: vi.fn() };
    const { rerender } = render(<ConditionSection {...props} conditions={[first, second]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove condition First' }));
    rerender(<ConditionSection {...props} conditions={[second]} />);
    expect(screen.getByLabelText('Condition name')).toHaveValue('Second');
    expect(screen.getAllByTestId('active-expression')).toHaveLength(1);
  });
});
