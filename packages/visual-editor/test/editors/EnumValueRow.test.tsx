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
import { FormProvider, useForm } from 'react-hook-form';
import { EnumValueRow } from '../../src/components/editors/EnumValueRow.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Wraps the component in a FormProvider seeded with member values from props. */
function Wrapper({
  name,
  displayName,
  children
}: {
  name: string;
  displayName: string;
  children: React.ReactNode;
}) {
  const form = useForm({
    defaultValues: {
      members: [{ name, displayName, typeName: '', cardinality: '', isOverride: false }]
    }
  });
  return <FormProvider {...form}>{children}</FormProvider>;
}

function renderRow(props: ReturnType<typeof baseProps>) {
  return render(
    <Wrapper name={props.name as string} displayName={props.displayName as string}>
      <EnumValueRow {...props} />
    </Wrapper>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EnumValueRow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders name and display name inputs', () => {
    renderRow(baseProps());

    const nameInput = screen.getByLabelText(/value name/i);
    expect(nameInput).toBeDefined();
    expect((nameInput as HTMLInputElement).value).toBe('USD');

    const displayInput = screen.getByPlaceholderText(/display name/i);
    expect(displayInput).toBeDefined();
    expect((displayInput as HTMLInputElement).value).toBe('US Dollar');
  });

  it('debounces name changes with 500ms delay', () => {
    const props = baseProps();
    renderRow(props);

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
    renderRow(props);

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
    renderRow(props);

    const removeBtn = screen.getByLabelText(/remove value/i);
    fireEvent.click(removeBtn);

    expect(props.onRemove).toHaveBeenCalledWith('node-1', 'USD');
  });

  it('renders drag handle', () => {
    const { container } = renderRow(baseProps());

    const handle = container.querySelector('[data-slot="drag-handle"]');
    expect(handle).toBeDefined();
    expect(handle?.textContent).toBe('⠿');
  });

  it('shows red border for empty name', () => {
    renderRow(baseProps({ name: '' }));

    const nameInput = screen.getByLabelText(/value name/i);
    expect(nameInput.className).toContain('border-red');
  });

  it('disables inputs when disabled prop is true', () => {
    renderRow(baseProps({ disabled: true }));

    const nameInput = screen.getByLabelText(/value name/i);
    expect(nameInput).toHaveProperty('disabled', true);
  });
});
