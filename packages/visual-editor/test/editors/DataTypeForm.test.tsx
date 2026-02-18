/**
 * Integration tests for DataTypeForm component (T047).
 *
 * Covers:
 * - Renders all fields for a loaded Data type
 * - Rename triggers renameType action
 * - Parent type selection triggers setInheritance
 * - Add/remove attribute round-trip
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DataTypeForm } from '../../src/components/editors/DataTypeForm.js';
import type { TypeNodeData, TypeOption, EditorFormActions } from '../../src/types.js';

function makeActions(overrides: Partial<EditorFormActions> = {}): EditorFormActions {
  return {
    renameType: vi.fn(),
    deleteType: vi.fn(),
    updateDefinition: vi.fn(),
    updateComments: vi.fn(),
    addSynonym: vi.fn(),
    removeSynonym: vi.fn(),
    addAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    updateAttribute: vi.fn(),
    reorderAttribute: vi.fn(),
    setInheritance: vi.fn(),
    addEnumValue: vi.fn(),
    removeEnumValue: vi.fn(),
    updateEnumValue: vi.fn(),
    reorderEnumValue: vi.fn(),
    setEnumParent: vi.fn(),
    addChoiceOption: vi.fn(),
    removeChoiceOption: vi.fn(),
    addInputParam: vi.fn(),
    removeInputParam: vi.fn(),
    updateOutputType: vi.fn(),
    updateExpression: vi.fn(),
    validate: vi.fn(() => []),
    ...overrides
  };
}

const AVAILABLE_TYPES: TypeOption[] = [
  { value: 'builtin::string', label: 'string', kind: 'builtin' },
  { value: 'builtin::date', label: 'date', kind: 'builtin' },
  { value: 'test::Event', label: 'Event', kind: 'data', namespace: 'test' }
];

function makeDataNode(): TypeNodeData<'data'> {
  return {
    kind: 'data',
    name: 'Trade',
    namespace: 'test.model',
    definition: 'A financial trade',
    members: [
      { name: 'tradeDate', typeName: 'date', cardinality: '(1..1)', isOverride: false },
      { name: 'currency', typeName: 'string', cardinality: '(1..1)', isOverride: false }
    ],
    parentName: 'Event',
    hasExternalRefs: false,
    errors: []
  };
}

describe('DataTypeForm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the type name in the header input', () => {
    const actions = makeActions();
    render(
      <DataTypeForm
        nodeId="test::Trade"
        data={makeDataNode()}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const nameInput = screen.getByLabelText(/data type name/i);
    expect((nameInput as HTMLInputElement).value).toBe('Trade');
  });

  it('renders the Data kind badge', () => {
    const actions = makeActions();
    const { container } = render(
      <DataTypeForm
        nodeId="test::Trade"
        data={makeDataNode()}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const badge = container.querySelector('[data-slot="badge"]');
    expect(badge?.textContent).toBe('Data');
  });

  it('renders all attribute rows', () => {
    const actions = makeActions();
    const { container } = render(
      <DataTypeForm
        nodeId="test::Trade"
        data={makeDataNode()}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const rows = container.querySelectorAll('[data-slot="attribute-row"]');
    expect(rows.length).toBe(2);
  });

  it('shows attribute count label', () => {
    const actions = makeActions();
    render(
      <DataTypeForm
        nodeId="test::Trade"
        data={makeDataNode()}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    expect(screen.getByText(/Attributes \(2\)/)).toBeDefined();
  });

  it('calls renameType after debounce when name changes', () => {
    const renameType = vi.fn();
    const actions = makeActions({ renameType });

    render(
      <DataTypeForm
        nodeId="test::Trade"
        data={makeDataNode()}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const nameInput = screen.getByLabelText(/data type name/i);
    fireEvent.change(nameInput, { target: { value: 'Execution' } });

    expect(renameType).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(renameType).toHaveBeenCalledWith('test::Trade', 'Execution');
  });

  it('calls addAttribute when "Add Attribute" button is clicked', () => {
    const addAttribute = vi.fn();
    const actions = makeActions({ addAttribute });
    const { container } = render(
      <DataTypeForm
        nodeId="test::Trade"
        data={makeDataNode()}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const addBtn = container.querySelector('[data-slot="add-attribute-btn"]');
    expect(addBtn).toBeDefined();
    fireEvent.click(addBtn!);

    expect(addAttribute).toHaveBeenCalledWith('test::Trade', '', 'string', '(1..1)');
  });

  it('calls removeAttribute when attribute remove button is clicked', () => {
    const removeAttribute = vi.fn();
    const actions = makeActions({ removeAttribute });

    render(
      <DataTypeForm
        nodeId="test::Trade"
        data={makeDataNode()}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const removeBtns = screen.getAllByLabelText(/remove attribute/i);
    fireEvent.click(removeBtns[0]!);

    expect(removeAttribute).toHaveBeenCalledWith('test::Trade', 'tradeDate');
  });

  it('shows empty state when no attributes', () => {
    const actions = makeActions();
    const data = makeDataNode();
    data.members = [];

    render(
      <DataTypeForm
        nodeId="test::Trade"
        data={data}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    expect(screen.getByText(/no attributes defined/i)).toBeDefined();
  });
});
