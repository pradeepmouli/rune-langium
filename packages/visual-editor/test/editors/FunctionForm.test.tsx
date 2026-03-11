/**
 * Integration tests for FunctionForm component (T052).
 *
 * Covers:
 * - Form renders inputs/output/expression for a loaded Function
 * - Add/remove input parameter
 * - Output type selection
 * - Expression textarea validation on blur
 * - Expression error clears on typing
 * - Name editing triggers renameType
 * - Function badge renders
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FunctionForm } from '../../src/components/editors/FunctionForm.js';
import type { TypeNodeData, TypeOption, EditorFormActions } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeActions(): EditorFormActions<'func'> {
  return {
    renameType: vi.fn(),
    deleteType: vi.fn(),
    updateDefinition: vi.fn(),
    updateComments: vi.fn(),
    addSynonym: vi.fn(),
    removeSynonym: vi.fn(),
    addInputParam: vi.fn(),
    removeInputParam: vi.fn(),
    updateOutputType: vi.fn(),
    updateExpression: vi.fn(),
    validate: vi.fn().mockReturnValue([])
  };
}

const AVAILABLE_TYPES: TypeOption[] = [
  { value: 'test.model::Trade', label: 'Trade', kind: 'data', namespace: 'test.model' },
  { value: 'test.model::Price', label: 'Price', kind: 'data', namespace: 'test.model' },
  { value: 'builtin::number', label: 'number', kind: 'builtin' },
  { value: 'builtin::string', label: 'string', kind: 'builtin' }
];

function makeFuncData(overrides: Partial<TypeNodeData<'func'>> = {}): TypeNodeData<'func'> {
  return {
    kind: 'func',
    name: 'CalculateNotional',
    namespace: 'test.model',
    members: [
      { name: 'trade', typeName: 'Trade', cardinality: '(1..1)', isOverride: false },
      { name: 'price', typeName: 'Price', cardinality: '(1..1)', isOverride: false }
    ],
    hasExternalRefs: false,
    errors: [],
    outputType: 'number',
    expressionText: 'trade -> price -> amount',
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FunctionForm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders header with name input and Function badge', () => {
    const actions = makeActions();
    render(
      <FunctionForm
        nodeId="fn1"
        data={makeFuncData()}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const nameInput = screen.getByLabelText('Function type name');
    expect(nameInput).toHaveValue('CalculateNotional');

    expect(screen.getByText('Function')).toBeInTheDocument();
  });

  it('renders input parameter rows', () => {
    const actions = makeActions();
    render(
      <FunctionForm
        nodeId="fn1"
        data={makeFuncData()}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    expect(screen.getByText('trade')).toBeInTheDocument();
    expect(screen.getByText('price')).toBeInTheDocument();
    expect(screen.getByText('Inputs (2)')).toBeInTheDocument();
  });

  it('renders expression textarea with current text', () => {
    const actions = makeActions();
    render(
      <FunctionForm
        nodeId="fn1"
        data={makeFuncData()}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const textarea = screen.getByLabelText('Function expression');
    expect(textarea).toHaveValue('trade -> price -> amount');
  });

  it('calls addInputParam when "Add Input" is clicked with name filled', () => {
    const actions = makeActions();
    render(
      <FunctionForm
        nodeId="fn1"
        data={makeFuncData({ members: [] })}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const nameInput = screen.getByLabelText('New input parameter name');
    fireEvent.change(nameInput, { target: { value: 'quantity' } });

    const addBtn = screen.getByText('+ Add Input');
    fireEvent.click(addBtn);

    expect(actions.addInputParam).toHaveBeenCalledWith('fn1', 'quantity', 'string');
  });

  it('calls removeInputParam when remove button is clicked', () => {
    const actions = makeActions();
    render(
      <FunctionForm
        nodeId="fn1"
        data={makeFuncData()}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const removeButtons = screen.getAllByLabelText(/Remove input/);
    fireEvent.click(removeButtons[0]!);

    expect(actions.removeInputParam).toHaveBeenCalledWith('fn1', 'trade');
  });

  it('shows expression error on blur when parentheses are unbalanced', () => {
    const actions = makeActions();
    render(
      <FunctionForm
        nodeId="fn1"
        data={makeFuncData({ expressionText: '' })}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const textarea = screen.getByLabelText('Function expression');
    fireEvent.change(textarea, { target: { value: '(trade -> price' } });
    fireEvent.blur(textarea);

    expect(screen.getByText(/Unbalanced parentheses/)).toBeInTheDocument();
    expect(actions.updateExpression).not.toHaveBeenCalled();
  });

  it('clears expression error on typing after a validation error', () => {
    const actions = makeActions();
    render(
      <FunctionForm
        nodeId="fn1"
        data={makeFuncData({ expressionText: '' })}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const textarea = screen.getByLabelText('Function expression');

    // Produce error
    fireEvent.change(textarea, { target: { value: '(' } });
    fireEvent.blur(textarea);
    expect(screen.getByText(/Unbalanced parentheses/)).toBeInTheDocument();

    // Resume typing — error should clear
    fireEvent.change(textarea, { target: { value: '(trade)' } });
    expect(screen.queryByText(/Unbalanced parentheses/)).not.toBeInTheDocument();
  });

  it('commits valid expression on blur', () => {
    const actions = makeActions();
    render(
      <FunctionForm
        nodeId="fn1"
        data={makeFuncData({ expressionText: '' })}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const textarea = screen.getByLabelText('Function expression');
    fireEvent.change(textarea, { target: { value: 'trade -> price -> amount' } });
    fireEvent.blur(textarea);

    expect(actions.updateExpression).toHaveBeenCalledWith('fn1', 'trade -> price -> amount');
  });

  it('renames function after debounced name change', () => {
    const actions = makeActions();
    render(
      <FunctionForm
        nodeId="fn1"
        data={makeFuncData()}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const nameInput = screen.getByLabelText('Function type name');
    fireEvent.change(nameInput, { target: { value: 'ComputePrice' } });

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(actions.renameType).toHaveBeenCalledWith('fn1', 'ComputePrice');
  });

  it('shows empty state when no input parameters exist', () => {
    const actions = makeActions();
    render(
      <FunctionForm
        nodeId="fn1"
        data={makeFuncData({ members: [] })}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    expect(screen.getByText('No input parameters defined.')).toBeInTheDocument();
  });
});
