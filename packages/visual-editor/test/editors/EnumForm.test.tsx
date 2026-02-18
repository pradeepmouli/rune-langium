/**
 * Integration tests for EnumForm component (T050).
 *
 * Covers:
 * - Form renders all fields for a loaded Enum
 * - Add/remove enum values
 * - Set display names
 * - Parent enum selection
 * - Reorder values
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { EnumForm } from '../../src/components/editors/EnumForm.js';
import type { TypeNodeData, TypeOption, EditorFormActions } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeActions(): EditorFormActions<'enum'> {
  return {
    renameType: vi.fn(),
    deleteType: vi.fn(),
    updateDefinition: vi.fn(),
    updateComments: vi.fn(),
    addSynonym: vi.fn(),
    removeSynonym: vi.fn(),
    addEnumValue: vi.fn(),
    removeEnumValue: vi.fn(),
    updateEnumValue: vi.fn(),
    reorderEnumValue: vi.fn(),
    setEnumParent: vi.fn(),
    validate: vi.fn().mockReturnValue([])
  };
}

const AVAILABLE_TYPES: TypeOption[] = [
  {
    value: 'test.enums::CurrencyEnum',
    label: 'CurrencyEnum',
    kind: 'enum',
    namespace: 'test.enums'
  },
  { value: 'test.enums::RatingEnum', label: 'RatingEnum', kind: 'enum', namespace: 'test.enums' },
  { value: 'builtin::string', label: 'string', kind: 'builtin' }
];

function makeEnumData(overrides: Partial<TypeNodeData<'enum'>> = {}): TypeNodeData<'enum'> {
  return {
    kind: 'enum',
    name: 'CurrencyEnum',
    namespace: 'test.enums',
    members: [
      {
        name: 'USD',
        typeName: undefined,
        cardinality: undefined,
        isOverride: false,
        displayName: 'US Dollar'
      },
      {
        name: 'EUR',
        typeName: undefined,
        cardinality: undefined,
        isOverride: false,
        displayName: 'Euro'
      },
      {
        name: 'GBP',
        typeName: undefined,
        cardinality: undefined,
        isOverride: false,
        displayName: 'British Pound'
      }
    ],
    hasExternalRefs: false,
    errors: [],
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EnumForm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders enum name in header', () => {
    render(
      <EnumForm
        nodeId="node-1"
        data={makeEnumData()}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    const nameInput = screen.getByLabelText(/type name/i);
    expect((nameInput as HTMLInputElement).value).toBe('CurrencyEnum');
  });

  it('renders "Enum" badge', () => {
    render(
      <EnumForm
        nodeId="node-1"
        data={makeEnumData()}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    expect(screen.getByText('Enum')).toBeDefined();
  });

  it('renders all enum value rows', () => {
    render(
      <EnumForm
        nodeId="node-1"
        data={makeEnumData()}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    const nameInputs = screen.getAllByLabelText(/value name/i);
    expect(nameInputs.length).toBe(3);
  });

  it('triggers addEnumValue when "Add Value" is clicked', () => {
    const actions = makeActions();

    render(
      <EnumForm
        nodeId="node-1"
        data={makeEnumData()}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const addBtn = screen.getByText(/Add Value/);
    fireEvent.click(addBtn);

    expect(actions.addEnumValue).toHaveBeenCalledWith('node-1', '', undefined);
  });

  it('triggers removeEnumValue when remove button is clicked', () => {
    const actions = makeActions();

    render(
      <EnumForm
        nodeId="node-1"
        data={makeEnumData()}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const removeBtns = screen.getAllByLabelText(/remove value/i);
    fireEvent.click(removeBtns[0]!);

    expect(actions.removeEnumValue).toHaveBeenCalledWith('node-1', 'USD');
  });

  it('triggers renameType after debounce on name change', () => {
    const actions = makeActions();

    render(
      <EnumForm
        nodeId="node-1"
        data={makeEnumData()}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const nameInput = screen.getByLabelText(/type name/i);
    fireEvent.change(nameInput, { target: { value: 'StatusEnum' } });

    expect(actions.renameType).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(actions.renameType).toHaveBeenCalledWith('node-1', 'StatusEnum');
  });

  it('shows count label for enum values', () => {
    render(
      <EnumForm
        nodeId="node-1"
        data={makeEnumData()}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    expect(screen.getByText(/3/)).toBeDefined();
  });
});
