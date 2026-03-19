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
import type { AnyGraphNode, TypeOption, EditorFormActions } from '../../src/types.js';

function makeActions(
  overrides: Partial<EditorFormActions<'data'>> = {}
): EditorFormActions<'data'> {
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
    validate: vi.fn(() => []),
    ...overrides
  };
}

const AVAILABLE_TYPES: TypeOption[] = [
  { value: 'builtin::string', label: 'string', kind: 'builtin' },
  { value: 'builtin::date', label: 'date', kind: 'builtin' },
  { value: 'test::Event', label: 'Event', kind: 'data', namespace: 'test' }
];

function makeDataNode(): AnyGraphNode {
  return {
    $type: 'Data',
    name: 'Trade',
    namespace: 'test.model',
    definition: 'A financial trade',
    attributes: [
      {
        $type: 'Attribute',
        name: 'tradeDate',
        typeCall: { $type: 'TypeCall', type: { $refText: 'date' } },
        card: { inf: 1, sup: 1, unbounded: false },
        override: false
      },
      {
        $type: 'Attribute',
        name: 'currency',
        typeCall: { $type: 'TypeCall', type: { $refText: 'string' } },
        card: { inf: 1, sup: 1, unbounded: false },
        override: false
      }
    ],
    superType: { $refText: 'Event' },
    conditions: [],
    annotations: [],
    synonyms: [],
    position: { x: 0, y: 0 },
    hasExternalRefs: false,
    errors: []
  } as AnyGraphNode;
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
    (data as any).attributes = [];

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

describe('DataTypeForm – merged inherited attribute list', () => {
  it('renders inherited attribute rows when inheritedGroups provided', () => {
    const { container } = render(
      <DataTypeForm
        nodeId="test::Trade"
        data={makeDataNode()}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
        inheritedGroups={[
          {
            ancestorName: 'BaseType',
            namespace: 'test',
            kind: 'data',
            members: [
              {
                $type: 'Attribute',
                name: 'id',
                typeCall: { $type: 'TypeCall', type: { $refText: 'string' } },
                card: { inf: 1, sup: 1, unbounded: false },
                override: false
              }
            ]
          }
        ]}
      />
    );
    const inherited = container.querySelectorAll('[data-slot="inherited-attribute-row"]');
    expect(inherited.length).toBe(1);
  });

  it('shows inherited-from label with ancestor name', () => {
    render(
      <DataTypeForm
        nodeId="test::Trade"
        data={makeDataNode()}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
        inheritedGroups={[
          {
            ancestorName: 'BaseType',
            namespace: 'test',
            kind: 'data',
            members: [
              {
                $type: 'Attribute',
                name: 'id',
                typeCall: { $type: 'TypeCall', type: { $refText: 'string' } },
                card: { inf: 1, sup: 1, unbounded: false },
                override: false
              }
            ]
          }
        ]}
      />
    );
    expect(screen.getByText(/inherited from BaseType/)).toBeDefined();
  });

  it('includes inherited count in Attributes label', () => {
    render(
      <DataTypeForm
        nodeId="test::Trade"
        data={makeDataNode()}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
        inheritedGroups={[
          {
            ancestorName: 'BaseType',
            namespace: 'test',
            kind: 'data',
            members: [
              {
                $type: 'Attribute',
                name: 'id',
                typeCall: { $type: 'TypeCall', type: { $refText: 'string' } },
                card: { inf: 1, sup: 1, unbounded: false },
                override: false
              }
            ]
          }
        ]}
      />
    );
    // 2 local + 1 inherited = 3
    expect(screen.getByText(/Attributes \(3\)/)).toBeDefined();
  });

  it('does not render a separate InheritedMembersSection', () => {
    const { container } = render(
      <DataTypeForm
        nodeId="test::Trade"
        data={makeDataNode()}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
        inheritedGroups={[
          {
            ancestorName: 'BaseType',
            namespace: 'test',
            kind: 'data',
            members: [
              {
                $type: 'Attribute',
                name: 'id',
                typeCall: { $type: 'TypeCall', type: { $refText: 'string' } },
                card: { inf: 1, sup: 1, unbounded: false },
                override: false
              }
            ]
          }
        ]}
      />
    );
    expect(container.querySelector('[data-slot="inherited-members-section"]')).toBeNull();
  });

  it('local attribute shadows inherited attribute with same name', () => {
    const data = makeDataNode();
    (data as any).attributes = [
      {
        $type: 'Attribute',
        name: 'id',
        typeCall: { $type: 'TypeCall', type: { $refText: 'string' } },
        card: { inf: 1, sup: 1, unbounded: false },
        override: false
      }
    ];
    const { container } = render(
      <DataTypeForm
        nodeId="test::Trade"
        data={data}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
        inheritedGroups={[
          {
            ancestorName: 'BaseType',
            namespace: 'test',
            kind: 'data',
            members: [
              {
                $type: 'Attribute',
                name: 'id',
                typeCall: { $type: 'TypeCall', type: { $refText: 'string' } },
                card: { inf: 1, sup: 1, unbounded: false },
                override: false
              }
            ]
          }
        ]}
      />
    );
    const local = container.querySelectorAll('[data-slot="attribute-row"]');
    const inherited = container.querySelectorAll('[data-slot="inherited-attribute-row"]');
    expect(local.length).toBe(1);
    expect(inherited.length).toBe(0);
  });

  it('Override button calls addAttribute', () => {
    const addAttribute = vi.fn();
    const { container } = render(
      <DataTypeForm
        nodeId="test::Trade"
        data={makeDataNode()}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions({ addAttribute })}
        inheritedGroups={[
          {
            ancestorName: 'BaseType',
            namespace: 'test',
            kind: 'data',
            members: [
              {
                $type: 'Attribute',
                name: 'id',
                typeCall: { $type: 'TypeCall', type: { $refText: 'string' } },
                card: { inf: 1, sup: 1, unbounded: false },
                override: false
              }
            ]
          }
        ]}
      />
    );
    const overrideBtn = container.querySelector('[data-slot="attribute-override"]');
    fireEvent.click(overrideBtn!);
    expect(addAttribute).toHaveBeenCalledWith('test::Trade', 'id', 'string', '(1..1)');
  });

  it('after Override, inherited row is replaced by local row', () => {
    const { container } = render(
      <DataTypeForm
        nodeId="test::Trade"
        data={makeDataNode()}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
        inheritedGroups={[
          {
            ancestorName: 'BaseType',
            namespace: 'test',
            kind: 'data',
            members: [
              {
                $type: 'Attribute',
                name: 'id',
                typeCall: { $type: 'TypeCall', type: { $refText: 'string' } },
                card: { inf: 1, sup: 1, unbounded: false },
                override: false
              }
            ]
          }
        ]}
      />
    );
    const overrideBtn = container.querySelector('[data-slot="attribute-override"]');
    fireEvent.click(overrideBtn!);
    const inherited = container.querySelectorAll('[data-slot="inherited-attribute-row"]');
    expect(inherited.length).toBe(0);
  });

  it('inherited rows have no remove or drag controls', () => {
    const { container } = render(
      <DataTypeForm
        nodeId="test::Trade"
        data={makeDataNode()}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
        inheritedGroups={[
          {
            ancestorName: 'BaseType',
            namespace: 'test',
            kind: 'data',
            members: [
              {
                $type: 'Attribute',
                name: 'id',
                typeCall: { $type: 'TypeCall', type: { $refText: 'string' } },
                card: { inf: 1, sup: 1, unbounded: false },
                override: false
              }
            ]
          }
        ]}
      />
    );
    const inheritedRow = container.querySelector('[data-slot="inherited-attribute-row"]')!;
    expect(inheritedRow.querySelector('[data-slot="attribute-remove"]')).toBeNull();
    expect(inheritedRow.querySelector('[data-slot="drag-handle"]')).toBeNull();
  });
});
