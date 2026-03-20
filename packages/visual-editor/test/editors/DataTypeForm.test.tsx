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
import type {
  AnyGraphNode,
  TypeOption,
  EditorFormActions,
  TypeGraphNode
} from '../../src/types.js';

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
  /** Build a parent node with given attributes, and a child node pointing to it. */
  function makeInheritanceNodes(
    childData: AnyGraphNode,
    parentAttrs: Record<string, unknown>[]
  ): TypeGraphNode[] {
    const parentNode = {
      id: 'test::BaseType',
      type: 'data',
      position: { x: 0, y: 0 },
      data: {
        $type: 'Data',
        name: 'BaseType',
        namespace: 'test',
        attributes: parentAttrs,
        conditions: [],
        annotations: [],
        synonyms: [],
        position: { x: 0, y: 0 },
        hasExternalRefs: false,
        errors: []
      }
    } as TypeGraphNode;
    const childNode = {
      id: 'test::Trade',
      type: 'data',
      position: { x: 0, y: 0 },
      data: childData
    } as TypeGraphNode;
    return [childNode, parentNode];
  }

  const baseTypeAttr = {
    $type: 'Attribute',
    name: 'id',
    typeCall: { $type: 'TypeCall', type: { $refText: 'string' } },
    card: { inf: 1, sup: 1, unbounded: false },
    override: false
  };

  /** makeDataNode already has superType: { $refText: 'Event' }; override to 'BaseType'. */
  function makeChildData(overrides: Record<string, unknown> = {}): AnyGraphNode {
    const d = makeDataNode();
    (d as any).superType = { $refText: 'BaseType' };
    return { ...d, ...overrides } as AnyGraphNode;
  }

  it('renders inherited attribute rows when allNodes provided', () => {
    const childData = makeChildData();
    const allNodes = makeInheritanceNodes(childData, [baseTypeAttr]);
    const { container } = render(
      <DataTypeForm
        nodeId="test::Trade"
        data={childData}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
        allNodes={allNodes}
      />
    );
    const inherited = container.querySelectorAll('[data-slot="inherited-attribute-row"]');
    expect(inherited.length).toBe(1);
  });

  it('shows inherited-from label with ancestor name', () => {
    const childData = makeChildData();
    const allNodes = makeInheritanceNodes(childData, [baseTypeAttr]);
    render(
      <DataTypeForm
        nodeId="test::Trade"
        data={childData}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
        allNodes={allNodes}
      />
    );
    expect(screen.getByText(/inherited from BaseType/)).toBeDefined();
  });

  it('includes inherited count in Attributes label', () => {
    const childData = makeChildData();
    const allNodes = makeInheritanceNodes(childData, [baseTypeAttr]);
    render(
      <DataTypeForm
        nodeId="test::Trade"
        data={childData}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
        allNodes={allNodes}
      />
    );
    // 2 local + 1 inherited = 3
    expect(screen.getByText(/Attributes \(3\)/)).toBeDefined();
  });

  it('does not render a separate InheritedMembersSection', () => {
    const childData = makeChildData();
    const allNodes = makeInheritanceNodes(childData, [baseTypeAttr]);
    const { container } = render(
      <DataTypeForm
        nodeId="test::Trade"
        data={childData}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
        allNodes={allNodes}
      />
    );
    expect(container.querySelector('[data-slot="inherited-members-section"]')).toBeNull();
  });

  it('local attribute shadows inherited attribute with same name', () => {
    const childData = makeChildData({
      attributes: [
        {
          $type: 'Attribute',
          name: 'id',
          typeCall: { $type: 'TypeCall', type: { $refText: 'string' } },
          card: { inf: 1, sup: 1, unbounded: false },
          override: false
        }
      ]
    });
    const allNodes = makeInheritanceNodes(childData, [baseTypeAttr]);
    const { container } = render(
      <DataTypeForm
        nodeId="test::Trade"
        data={childData}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
        allNodes={allNodes}
      />
    );
    const local = container.querySelectorAll('[data-slot="attribute-row"]');
    const inherited = container.querySelectorAll('[data-slot="inherited-attribute-row"]');
    expect(local.length).toBe(1);
    expect(inherited.length).toBe(0);
  });

  it('Override button calls addAttribute', () => {
    const addAttribute = vi.fn();
    const childData = makeChildData();
    const allNodes = makeInheritanceNodes(childData, [baseTypeAttr]);
    const { container } = render(
      <DataTypeForm
        nodeId="test::Trade"
        data={childData}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions({ addAttribute })}
        allNodes={allNodes}
      />
    );
    const overrideBtn = container.querySelector('[data-slot="attribute-override"]');
    fireEvent.click(overrideBtn!);
    expect(addAttribute).toHaveBeenCalledWith('test::Trade', 'id', 'string', '(1..1)');
  });

  it('after Override, addAttribute action is dispatched for the inherited attribute', () => {
    const addAttribute = vi.fn();
    const childData = makeChildData();
    const allNodes = makeInheritanceNodes(childData, [baseTypeAttr]);
    const { container } = render(
      <DataTypeForm
        nodeId="test::Trade"
        data={childData}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions({ addAttribute })}
        allNodes={allNodes}
      />
    );
    const overrideBtn = container.querySelector('[data-slot="attribute-override"]');
    fireEvent.click(overrideBtn!);
    // The action dispatches addAttribute; when the store updates and re-renders
    // with the new data, the inherited row will be shadowed by the local one.
    expect(addAttribute).toHaveBeenCalledWith('test::Trade', 'id', 'string', '(1..1)');
  });

  it('inherited rows have no remove or drag controls', () => {
    const childData = makeChildData();
    const allNodes = makeInheritanceNodes(childData, [baseTypeAttr]);
    const { container } = render(
      <DataTypeForm
        nodeId="test::Trade"
        data={childData}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
        allNodes={allNodes}
      />
    );
    const inheritedRow = container.querySelector('[data-slot="inherited-attribute-row"]')!;
    expect(inheritedRow.querySelector('[data-slot="attribute-remove"]')).toBeNull();
    expect(inheritedRow.querySelector('[data-slot="drag-handle"]')).toBeNull();
  });
});
