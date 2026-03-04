/**
 * Tests for ReferencePicker — scope-aware variable picker.
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
    const { container } = render(
      <ReferencePicker open={false} scope={testScope} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    expect(container.querySelector('[data-testid="reference-picker"]')).toBeNull();
  });

  it('shows all scope entries when open', () => {
    const { container } = render(
      <ReferencePicker open={true} scope={testScope} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    expect(container.textContent).toContain('trade');
    expect(container.textContent).toContain('parties');
    expect(container.textContent).toContain('result');
    expect(container.textContent).toContain('price');
  });

  it('shows type and cardinality', () => {
    const { container } = render(
      <ReferencePicker open={true} scope={testScope} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    expect(container.textContent).toContain('Trade');
    expect(container.textContent).toContain('1..1');
  });

  it('shows origin badges', () => {
    const { container } = render(
      <ReferencePicker open={true} scope={testScope} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    expect(container.textContent).toContain('input');
    expect(container.textContent).toContain('output');
    expect(container.textContent).toContain('alias');
  });

  it('creates RosettaSymbolReference on select', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <ReferencePicker open={true} scope={testScope} onSelect={onSelect} onClose={onClose} />
    );

    const tradeButton = container.querySelector('[data-testid="ref-option-trade"]');
    expect(tradeButton).toBeTruthy();
    fireEvent.click(tradeButton!);

    expect(onSelect).toHaveBeenCalledTimes(1);
    const node = onSelect.mock.calls[0][0];
    expect((node as Record<string, unknown>)['$type']).toBe('RosettaSymbolReference');
    expect((node as Record<string, unknown>)['symbol']).toBe('trade');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows message for empty scope', () => {
    const emptyScope: FunctionScope = { inputs: [], output: null, aliases: [] };
    const { container } = render(
      <ReferencePicker open={true} scope={emptyScope} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    expect(container.textContent).toContain('No variables in scope');
  });
});
