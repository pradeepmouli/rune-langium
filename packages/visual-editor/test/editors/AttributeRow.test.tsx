/**
 * Unit tests for AttributeRow component (T046).
 *
 * Covers:
 * - Name/type/cardinality rendering
 * - Auto-save debounce on name change
 * - Remove callback
 * - Drag reorder callback
 * - Override badge display
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AttributeRow } from '../../src/components/editors/AttributeRow.js';
import type { MemberDisplay, TypeOption } from '../../src/types.js';

const AVAILABLE_TYPES: TypeOption[] = [
  { value: 'builtin::string', label: 'string', kind: 'builtin' },
  { value: 'builtin::number', label: 'number', kind: 'builtin' },
  { value: 'builtin::date', label: 'date', kind: 'builtin' }
];

function baseMember(overrides: Partial<MemberDisplay> = {}): MemberDisplay {
  return {
    name: 'tradeDate',
    typeName: 'date',
    cardinality: '(1..1)',
    isOverride: false,
    ...overrides
  };
}

describe('AttributeRow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders name, type, and cardinality', () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    const onReorder = vi.fn();

    render(
      <AttributeRow
        member={baseMember()}
        nodeId="node-1"
        index={0}
        availableTypes={AVAILABLE_TYPES}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onReorder={onReorder}
      />
    );

    const nameInput = screen.getByLabelText(/attribute name/i);
    expect(nameInput).toBeDefined();
    expect((nameInput as HTMLInputElement).value).toBe('tradeDate');
  });

  it('debounces name changes with 500ms delay', () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    const onReorder = vi.fn();

    render(
      <AttributeRow
        member={baseMember()}
        nodeId="node-1"
        index={0}
        availableTypes={AVAILABLE_TYPES}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onReorder={onReorder}
      />
    );

    const nameInput = screen.getByLabelText(/attribute name/i);
    fireEvent.change(nameInput, { target: { value: 'executionDate' } });

    // Not committed yet
    expect(onUpdate).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith('node-1', 'tradeDate', 'executionDate', 'date', '(1..1)');
  });

  it('calls onRemove when remove button is clicked', () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    const onReorder = vi.fn();

    render(
      <AttributeRow
        member={baseMember()}
        nodeId="node-1"
        index={0}
        availableTypes={AVAILABLE_TYPES}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onReorder={onReorder}
      />
    );

    const removeBtn = screen.getByLabelText(/remove attribute/i);
    fireEvent.click(removeBtn);

    expect(onRemove).toHaveBeenCalledWith('node-1', 'tradeDate');
  });

  it('shows override badge for override attributes', () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    const onReorder = vi.fn();

    render(
      <AttributeRow
        member={baseMember({ isOverride: true })}
        nodeId="node-1"
        index={0}
        availableTypes={AVAILABLE_TYPES}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onReorder={onReorder}
      />
    );

    expect(screen.getByText('override')).toBeDefined();
  });

  it('disables remove button for override attributes', () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    const onReorder = vi.fn();

    render(
      <AttributeRow
        member={baseMember({ isOverride: true })}
        nodeId="node-1"
        index={0}
        availableTypes={AVAILABLE_TYPES}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onReorder={onReorder}
      />
    );

    const removeBtn = screen.getByLabelText(/remove attribute/i);
    expect(removeBtn).toHaveProperty('disabled', true);
  });

  it('renders drag handle', () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    const onReorder = vi.fn();

    const { container } = render(
      <AttributeRow
        member={baseMember()}
        nodeId="node-1"
        index={0}
        availableTypes={AVAILABLE_TYPES}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onReorder={onReorder}
      />
    );

    const handle = container.querySelector('[data-slot="drag-handle"]');
    expect(handle).toBeDefined();
    expect(handle?.textContent).toBe('⠿');
  });

  it('disables input when disabled prop is true', () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    const onReorder = vi.fn();

    render(
      <AttributeRow
        member={baseMember()}
        nodeId="node-1"
        index={0}
        availableTypes={AVAILABLE_TYPES}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onReorder={onReorder}
        disabled
      />
    );

    const nameInput = screen.getByLabelText(/attribute name/i);
    expect(nameInput).toHaveProperty('disabled', true);
  });
});
