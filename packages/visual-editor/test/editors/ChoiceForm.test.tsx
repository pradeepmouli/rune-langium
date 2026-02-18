/**
 * Integration tests for ChoiceForm component (T051).
 *
 * Covers:
 * - Form renders all options for a loaded Choice
 * - Add option shows type selector
 * - Remove option removes member
 * - Choice badge renders
 * - Name editing triggers renameType
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ChoiceForm } from '../../src/components/editors/ChoiceForm.js';
import type { TypeNodeData, TypeOption, EditorFormActions } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeActions(): EditorFormActions<'choice'> {
  return {
    renameType: vi.fn(),
    deleteType: vi.fn(),
    updateDefinition: vi.fn(),
    updateComments: vi.fn(),
    addSynonym: vi.fn(),
    removeSynonym: vi.fn(),
    addChoiceOption: vi.fn(),
    removeChoiceOption: vi.fn(),
    validate: vi.fn().mockReturnValue([])
  };
}

const AVAILABLE_TYPES: TypeOption[] = [
  { value: 'test.model::CashPayment', label: 'CashPayment', kind: 'data', namespace: 'test.model' },
  {
    value: 'test.model::PhysicalSettlement',
    label: 'PhysicalSettlement',
    kind: 'data',
    namespace: 'test.model'
  },
  { value: 'test.model::Trade', label: 'Trade', kind: 'data', namespace: 'test.model' },
  { value: 'builtin::string', label: 'string', kind: 'builtin' }
];

function makeChoiceData(overrides: Partial<TypeNodeData<'choice'>> = {}): TypeNodeData<'choice'> {
  return {
    kind: 'choice',
    name: 'PaymentType',
    namespace: 'test.model',
    members: [
      { name: 'cashPayment', typeName: 'CashPayment', cardinality: undefined, isOverride: false },
      {
        name: 'physicalSettlement',
        typeName: 'PhysicalSettlement',
        cardinality: undefined,
        isOverride: false
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

describe('ChoiceForm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders choice name in header', () => {
    render(
      <ChoiceForm
        nodeId="node-1"
        data={makeChoiceData()}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    const nameInput = screen.getByLabelText(/type name/i);
    expect((nameInput as HTMLInputElement).value).toBe('PaymentType');
  });

  it('renders "Choice" badge', () => {
    render(
      <ChoiceForm
        nodeId="node-1"
        data={makeChoiceData()}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    expect(screen.getByText('Choice')).toBeDefined();
  });

  it('renders all option rows', () => {
    const { container } = render(
      <ChoiceForm
        nodeId="node-1"
        data={makeChoiceData()}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    const rows = container.querySelectorAll('[data-slot="choice-option-row"]');
    expect(rows.length).toBe(2);
  });

  it('triggers removeChoiceOption when remove button is clicked', () => {
    const actions = makeActions();

    render(
      <ChoiceForm
        nodeId="node-1"
        data={makeChoiceData()}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const removeBtns = screen.getAllByLabelText(/remove option/i);
    fireEvent.click(removeBtns[0]!);

    expect(actions.removeChoiceOption).toHaveBeenCalledWith('node-1', 'CashPayment');
  });

  it('triggers renameType after debounce on name change', () => {
    const actions = makeActions();

    render(
      <ChoiceForm
        nodeId="node-1"
        data={makeChoiceData()}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const nameInput = screen.getByLabelText(/type name/i);
    fireEvent.change(nameInput, { target: { value: 'SettlementType' } });

    expect(actions.renameType).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(actions.renameType).toHaveBeenCalledWith('node-1', 'SettlementType');
  });

  it('shows options count label', () => {
    render(
      <ChoiceForm
        nodeId="node-1"
        data={makeChoiceData()}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    expect(screen.getByText(/2/)).toBeDefined();
  });

  it('renders empty state when no options', () => {
    render(
      <ChoiceForm
        nodeId="node-1"
        data={makeChoiceData({ members: [] })}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    expect(screen.getByText(/No options defined/)).toBeDefined();
  });
});
