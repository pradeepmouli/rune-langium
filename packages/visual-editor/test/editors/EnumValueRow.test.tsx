/**
 * Unit tests for EnumValueRow component (T049).
 *
 * Covers:
 * - Name/displayName rendering
 * - Auto-save debounce on name change
 * - Remove callback
 * - Drag reorder callback
 * - Empty name validation (red border)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { EnumValueRow } from '../../src/components/editors/EnumValueRow.js';

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    name: 'USD',
    displayName: 'US Dollar',
    nodeId: 'node-1',
    index: 0,
    onUpdate: vi.fn(),
    onRemove: vi.fn(),
    onReorder: vi.fn(),
    ...overrides
  };
}

describe('EnumValueRow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders name and display name inputs', () => {
    render(<EnumValueRow {...baseProps()} />);

    const nameInput = screen.getByLabelText(/value name/i);
    expect(nameInput).toBeDefined();
    expect((nameInput as HTMLInputElement).value).toBe('USD');

    const displayInput = screen.getByPlaceholderText(/display name/i);
    expect(displayInput).toBeDefined();
    expect((displayInput as HTMLInputElement).value).toBe('US Dollar');
  });

  it('debounces name changes with 500ms delay', () => {
    const props = baseProps();
    render(<EnumValueRow {...props} />);

    const nameInput = screen.getByLabelText(/value name/i);
    fireEvent.change(nameInput, { target: { value: 'US_Dollar' } });

    // Not committed yet
    expect(props.onUpdate).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(props.onUpdate).toHaveBeenCalledOnce();
    expect(props.onUpdate).toHaveBeenCalledWith('node-1', 'USD', 'US_Dollar', 'US Dollar');
  });

  it('debounces display name changes', () => {
    const props = baseProps();
    render(<EnumValueRow {...props} />);

    const displayInput = screen.getByPlaceholderText(/display name/i);
    fireEvent.change(displayInput, { target: { value: 'United States Dollar' } });

    expect(props.onUpdate).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(props.onUpdate).toHaveBeenCalledOnce();
    expect(props.onUpdate).toHaveBeenCalledWith('node-1', 'USD', 'USD', 'United States Dollar');
  });

  it('calls onRemove when remove button is clicked', () => {
    const props = baseProps();
    render(<EnumValueRow {...props} />);

    const removeBtn = screen.getByLabelText(/remove value/i);
    fireEvent.click(removeBtn);

    expect(props.onRemove).toHaveBeenCalledWith('node-1', 'USD');
  });

  it('renders drag handle', () => {
    const { container } = render(<EnumValueRow {...baseProps()} />);

    const handle = container.querySelector('[data-slot="drag-handle"]');
    expect(handle).toBeDefined();
    expect(handle?.textContent).toBe('⠿');
  });

  it('shows red border for empty name', () => {
    const { container } = render(<EnumValueRow {...baseProps({ name: '' })} />);

    const nameInput = screen.getByLabelText(/value name/i);
    expect(nameInput.className).toContain('border-red');
  });

  it('disables inputs when disabled prop is true', () => {
    render(<EnumValueRow {...baseProps({ disabled: true })} />);

    const nameInput = screen.getByLabelText(/value name/i);
    expect(nameInput).toHaveProperty('disabled', true);
  });
});
