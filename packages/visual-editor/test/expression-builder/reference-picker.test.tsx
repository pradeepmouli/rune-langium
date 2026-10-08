// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for ReferencePicker — scope-aware variable picker.
 *
 * NOTE: ReferencePicker uses the DS Base UI Select, which renders through
 * a portal into document.body. Queries target document.body.
 *
 * @module
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReferencePicker } from '../../src/components/editors/expression-builder/ReferencePicker.js';
import { expressionScopeFromEntries } from '../../src/adapters/expression-scope.js';
import type { FunctionScope } from '../../src/store/expression-store.js';

const testScope: FunctionScope = {
  inputs: [
    { name: 'trade', typeName: 'Trade', cardinality: '1..1' },
    { name: 'parties', typeName: 'Party', cardinality: '0..*' }
  ],
  output: { name: 'result', typeName: 'number' },
  aliases: [{ name: 'price', typeName: 'number' }]
};

describe('ReferencePicker', () => {
  it('does not render when closed', () => {
    render(<ReferencePicker open={false} scope={testScope} onSelect={vi.fn()} onClose={vi.fn()} />);
    // Select portal content should not be in the DOM when closed
    expect(document.body.querySelector('[data-testid="reference-picker"]')).toBeNull();
  });

  it('shows all scope entries when open', () => {
    render(<ReferencePicker open={true} scope={testScope} onSelect={vi.fn()} onClose={vi.fn()} />);
    const picker = document.body.querySelector('[data-testid="reference-picker"]')!;
    expect(picker.textContent).toContain('trade');
    expect(picker.textContent).toContain('parties');
    expect(picker.textContent).toContain('result');
    expect(picker.textContent).toContain('price');
  });

  it('shows type and cardinality', () => {
    render(<ReferencePicker open={true} scope={testScope} onSelect={vi.fn()} onClose={vi.fn()} />);
    const picker = document.body.querySelector('[data-testid="reference-picker"]')!;
    expect(picker.textContent).toContain('Trade');
    expect(picker.textContent).toContain('1..1');
  });

  it('shows origin badges', () => {
    render(<ReferencePicker open={true} scope={testScope} onSelect={vi.fn()} onClose={vi.fn()} />);
    const picker = document.body.querySelector('[data-testid="reference-picker"]')!;
    expect(picker.textContent).toContain('input');
    expect(picker.textContent).toContain('output');
    expect(picker.textContent).toContain('alias');
  });

  it('creates RosettaSymbolReference on pointer selection', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<ReferencePicker open={true} scope={testScope} onSelect={onSelect} onClose={onClose} />);

    const tradeItem = screen.getByTestId('ref-option-trade');
    fireEvent.pointerDown(tradeItem, { pointerType: 'mouse' });
    fireEvent.click(tradeItem);

    expect(onSelect).toHaveBeenCalledTimes(1);
    const node = onSelect.mock.calls[0][0];
    expect((node as Record<string, unknown>)['$type']).toBe('RosettaSymbolReference');
    expect((node as Record<string, unknown>)['symbol']).toBe('trade');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Enter', 'Enter'],
    ['Space', ' ']
  ])('creates RosettaSymbolReference on %s selection', (code, key) => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<ReferencePicker open={true} scope={testScope} onSelect={onSelect} onClose={onClose} />);

    const tradeItem = screen.getByTestId('ref-option-trade');
    tradeItem.focus();
    fireEvent.keyDown(tradeItem, { key, code });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({ $type: 'RosettaSymbolReference', symbol: 'trade' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows message for empty scope', () => {
    const emptyScope: FunctionScope = { inputs: [], output: null, aliases: [] };
    render(<ReferencePicker open={true} scope={emptyScope} onSelect={vi.fn()} onClose={vi.fn()} />);
    const picker = document.body.querySelector('[data-testid="reference-picker"]')!;
    expect(picker.textContent).toContain('No variables in scope');
  });
  it('offers inherited attributes and creates callable argument placeholders', () => {
    const onSelect = vi.fn();
    const scope: FunctionScope = {
      inputs: [],
      aliases: [],
      output: null,
      attributes: [{ name: 'inherited', kind: 'attribute', declarationId: 'file:///base#attribute' }],
      references: [{ name: 'Combine', kind: 'callable', argumentCount: 2, declarationId: 'file:///helper#function' }]
    };
    render(<ReferencePicker open scope={scope} onSelect={onSelect} onClose={vi.fn()} />);
    expect(screen.getByTestId('ref-option-inherited')).toBeVisible();
    fireEvent.pointerDown(screen.getByTestId('ref-option-Combine'), { pointerType: 'mouse' });
    fireEvent.click(screen.getByTestId('ref-option-Combine'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: 'Combine',
        explicitArguments: true,
        rawArgs: [expect.objectContaining({ $type: 'Placeholder' }), expect.objectContaining({ $type: 'Placeholder' })]
      })
    );
  });
  it('offers Choice symbols through the canonical scope adapter', () => {
    const onSelect = vi.fn();
    const scope = expressionScopeFromEntries([
      { name: 'Asset', kind: 'choice', declarationId: 'file:///model#choice' }
    ]);
    render(<ReferencePicker open scope={scope} onSelect={onSelect} onClose={vi.fn()} />);
    const option = screen.getByTestId('ref-option-Asset');
    expect(option).toHaveTextContent('choice');
    fireEvent.pointerDown(option, { pointerType: 'mouse' });
    fireEvent.click(option);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ $type: 'RosettaSymbolReference', symbol: 'Asset' })
    );
    expect(onSelect.mock.calls[0][0]).not.toHaveProperty('explicitArguments');
  });
});
