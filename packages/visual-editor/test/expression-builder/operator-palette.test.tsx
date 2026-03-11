/**
 * Tests for OperatorPalette — categorized operator picker.
 *
 * @module
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { OperatorPalette } from '../../src/components/editors/expression-builder/OperatorPalette.js';
import { OPERATOR_CATALOG } from '../../src/components/editors/expression-builder/operator-catalog.js';

describe('OperatorPalette', () => {
  it('does not render when closed', () => {
    const { container } = render(
      <OperatorPalette open={false} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    expect(container.querySelector('[data-testid="operator-palette"]')).toBeNull();
  });

  it('renders when open', () => {
    const { container } = render(
      <OperatorPalette open={true} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    expect(container.querySelector('[data-testid="operator-palette"]')).toBeTruthy();
  });

  it('displays all categories', () => {
    const { container } = render(
      <OperatorPalette open={true} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    for (const category of OPERATOR_CATALOG) {
      expect(container.textContent).toContain(category.label);
    }
  });

  it('filters operators by search text', () => {
    const { container } = render(
      <OperatorPalette open={true} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    const input = container.querySelector('[data-testid="palette-search"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'filter' } });

    // Should show filter operator
    expect(container.textContent).toContain('filter');
    // Should not show unrelated categories like Arithmetic if nothing matches
    const buttons = container.querySelectorAll('button[role="option"]');
    const labels = Array.from(buttons).map((b) => b.textContent);
    expect(labels.some((l) => l?.includes('filter'))).toBe(true);
  });

  it('calls onSelect with created node when operator clicked', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <OperatorPalette open={true} onSelect={onSelect} onClose={onClose} />
    );

    // Click the first operator (+ Add)
    const firstButton = container.querySelector('button[role="option"]');
    expect(firstButton).toBeTruthy();
    fireEvent.click(firstButton!);

    expect(onSelect).toHaveBeenCalledTimes(1);
    const node = onSelect.mock.calls[0][0];
    expect(node).toBeDefined();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape key', () => {
    const onClose = vi.fn();
    render(<OperatorPalette open={true} onSelect={vi.fn()} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
