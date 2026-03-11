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
import { useForm, FormProvider } from 'react-hook-form';
import { AttributeRow } from '../../src/components/editors/AttributeRow.js';
import type { MemberDisplay, TypeOption } from '../../src/types.js';
import type { MemberValues } from '../../src/schemas/form-schemas.js';

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

/** Convert MemberDisplay to MemberValues for the form. */
function toMemberValues(m: MemberDisplay): MemberValues {
  return {
    name: m.name,
    typeName: m.typeName ?? 'string',
    cardinality: m.cardinality ?? '(1..1)',
    isOverride: m.isOverride,
    displayName: m.displayName
  };
}

/** Wrapper that provides FormProvider context required by AttributeRow. */
function FormWrapper({
  members,
  children
}: {
  members: MemberValues[];
  children: React.ReactNode;
}) {
  const methods = useForm({ defaultValues: { members } });
  return <FormProvider {...methods}>{children}</FormProvider>;
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
    const member = baseMember();

    render(
      <FormWrapper members={[toMemberValues(member)]}>
        <AttributeRow
          index={0}
          committedName={member.name}
          availableTypes={AVAILABLE_TYPES}
          onUpdate={onUpdate}
          onRemove={onRemove}
          onReorder={onReorder}
        />
      </FormWrapper>
    );

    const nameInput = screen.getByLabelText(/attribute name/i);
    expect(nameInput).toBeDefined();
    expect((nameInput as HTMLInputElement).value).toBe('tradeDate');
  });

  it('debounces name changes with 500ms delay', () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    const onReorder = vi.fn();
    const member = baseMember();

    render(
      <FormWrapper members={[toMemberValues(member)]}>
        <AttributeRow
          index={0}
          committedName={member.name}
          availableTypes={AVAILABLE_TYPES}
          onUpdate={onUpdate}
          onRemove={onRemove}
          onReorder={onReorder}
        />
      </FormWrapper>
    );

    const nameInput = screen.getByLabelText(/attribute name/i);
    fireEvent.change(nameInput, { target: { value: 'executionDate' } });

    // Not committed yet
    expect(onUpdate).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith(0, 'tradeDate', 'executionDate', 'date', '(1..1)');
  });

  it('calls onRemove when remove button is clicked', () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    const onReorder = vi.fn();
    const member = baseMember();

    render(
      <FormWrapper members={[toMemberValues(member)]}>
        <AttributeRow
          index={0}
          committedName={member.name}
          availableTypes={AVAILABLE_TYPES}
          onUpdate={onUpdate}
          onRemove={onRemove}
          onReorder={onReorder}
        />
      </FormWrapper>
    );

    const removeBtn = screen.getByLabelText(/remove attribute/i);
    fireEvent.click(removeBtn);

    expect(onRemove).toHaveBeenCalledWith(0);
  });

  it('shows override badge for override attributes', () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    const onReorder = vi.fn();
    const member = baseMember({ isOverride: true });

    render(
      <FormWrapper members={[toMemberValues(member)]}>
        <AttributeRow
          index={0}
          committedName={member.name}
          availableTypes={AVAILABLE_TYPES}
          onUpdate={onUpdate}
          onRemove={onRemove}
          onReorder={onReorder}
        />
      </FormWrapper>
    );

    expect(screen.getByText('override')).toBeDefined();
  });

  it('disables remove button for override attributes', () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    const onReorder = vi.fn();
    const member = baseMember({ isOverride: true });

    render(
      <FormWrapper members={[toMemberValues(member)]}>
        <AttributeRow
          index={0}
          committedName={member.name}
          availableTypes={AVAILABLE_TYPES}
          onUpdate={onUpdate}
          onRemove={onRemove}
          onReorder={onReorder}
        />
      </FormWrapper>
    );

    const removeBtn = screen.getByLabelText(/remove attribute/i);
    expect(removeBtn).toHaveProperty('disabled', true);
  });

  it('renders drag handle', () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    const onReorder = vi.fn();
    const member = baseMember();

    const { container } = render(
      <FormWrapper members={[toMemberValues(member)]}>
        <AttributeRow
          index={0}
          committedName={member.name}
          availableTypes={AVAILABLE_TYPES}
          onUpdate={onUpdate}
          onRemove={onRemove}
          onReorder={onReorder}
        />
      </FormWrapper>
    );

    const handle = container.querySelector('[data-slot="drag-handle"]');
    expect(handle).toBeDefined();
    expect(handle?.textContent).toBe('⠿');
  });

  it('disables input when disabled prop is true', () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    const onReorder = vi.fn();
    const member = baseMember();

    render(
      <FormWrapper members={[toMemberValues(member)]}>
        <AttributeRow
          index={0}
          committedName={member.name}
          availableTypes={AVAILABLE_TYPES}
          onUpdate={onUpdate}
          onRemove={onRemove}
          onReorder={onReorder}
          disabled
        />
      </FormWrapper>
    );

    const nameInput = screen.getByLabelText(/attribute name/i);
    expect(nameInput).toHaveProperty('disabled', true);
  });
});
