// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for ReferencePicker — scope-aware variable picker.
 *
 * NOTE: ReferencePicker now uses DS Popover (renders via Portal into
 * document.body) + Command (cmdk). Queries target document.body.
 *
 * @module
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ReferencePicker } from '../../src/components/editors/expression-builder/ReferencePicker.js';
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
    // Popover portal content should not be in DOM when closed
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

  it('creates RosettaSymbolReference on select', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<ReferencePicker open={true} scope={testScope} onSelect={onSelect} onClose={onClose} />);

    const tradeItem = document.body.querySelector('[data-testid="ref-option-trade"]');
    expect(tradeItem).toBeTruthy();
    fireEvent.click(tradeItem!);

    expect(onSelect).toHaveBeenCalledTimes(1);
    const node = onSelect.mock.calls[0][0];
    expect((node as Record<string, unknown>)['$type']).toBe('RosettaSymbolReference');
    expect((node as Record<string, unknown>)['symbol']).toBe('trade');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows message for empty scope', () => {
    const emptyScope: FunctionScope = { inputs: [], output: null, aliases: [] };
    render(<ReferencePicker open={true} scope={emptyScope} onSelect={vi.fn()} onClose={vi.fn()} />);
    const picker = document.body.querySelector('[data-testid="reference-picker"]')!;
    expect(picker.textContent).toContain('No variables in scope');
  });
});
