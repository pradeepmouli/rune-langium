// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for OperatorPalette — categorized operator picker.
 *
 * NOTE: OperatorPalette now uses DS Popover (renders via Portal into
 * document.body) + Command (cmdk). Queries target document.body.
 *
 * @module
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { OperatorPalette } from '../../src/components/editors/expression-builder/OperatorPalette.js';
import { OPERATOR_CATALOG } from '../../src/components/editors/expression-builder/operator-catalog.js';

describe('OperatorPalette', () => {
  it('does not render when closed', () => {
    render(<OperatorPalette open={false} onSelect={vi.fn()} onClose={vi.fn()} />);
    // Popover portal content should not be in DOM when closed
    expect(document.body.querySelector('[data-testid="operator-palette"]')).toBeNull();
  });

  it('renders when open', () => {
    render(<OperatorPalette open={true} onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(document.body.querySelector('[data-testid="operator-palette"]')).toBeTruthy();
  });

  it('displays all categories', () => {
    render(<OperatorPalette open={true} onSelect={vi.fn()} onClose={vi.fn()} />);
    const palette = document.body.querySelector('[data-testid="operator-palette"]')!;
    for (const category of OPERATOR_CATALOG) {
      expect(palette.textContent).toContain(category.label);
    }
  });

  it('filters operators by search text', () => {
    render(<OperatorPalette open={true} onSelect={vi.fn()} onClose={vi.fn()} />);
    const input = document.body.querySelector('[data-testid="palette-search"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'filter' } });

    // Should show filter operator — cmdk items use data-slot="command-item"
    const items = document.body.querySelectorAll('[data-slot="command-item"]');
    const labels = Array.from(items).map((b) => b.textContent);
    expect(labels.some((l) => l?.toLowerCase().includes('filter'))).toBe(true);
  });

  it('calls onSelect with created node when operator clicked', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<OperatorPalette open={true} onSelect={onSelect} onClose={onClose} />);

    // Click the first cmdk command-item (operator)
    const firstItem = document.body.querySelector('[data-slot="command-item"]');
    expect(firstItem).toBeTruthy();
    fireEvent.click(firstItem!);

    expect(onSelect).toHaveBeenCalledTimes(1);
    const node = onSelect.mock.calls[0][0];
    expect(node).toBeDefined();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape key via Popover handler', () => {
    const onClose = vi.fn();
    render(<OperatorPalette open={true} onSelect={vi.fn()} onClose={onClose} />);

    // Radix Popover listens for Escape on the document level
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the reference picker button when onOpenReferencePicker provided', () => {
    const onOpenRef = vi.fn();
    render(<OperatorPalette open={true} onSelect={vi.fn()} onClose={vi.fn()} onOpenReferencePicker={onOpenRef} />);
    const refBtn = document.body.querySelector('[data-testid="palette-open-reference"]');
    expect(refBtn).toBeTruthy();
    fireEvent.click(refBtn!);
    expect(onOpenRef).toHaveBeenCalledTimes(1);
  });
});
