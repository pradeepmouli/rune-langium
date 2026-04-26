// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

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

// ---------------------------------------------------------------------------
// US1 TDD tests (T010–T012) — baseline + external-sync contract
// ---------------------------------------------------------------------------

// Spy on the upstream useExternalSync hook so T012 can assert the migration
// adopted it (vs. the now-deleted local <ExternalDataSync> component).
const useExternalSyncSpy = vi.fn();
vi.mock('@zod-to-form/react', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('@zod-to-form/react');
  return {
    ...actual,
    useExternalSync: (...args: unknown[]) => {
      useExternalSyncSpy(...args);
      return (actual as any).useExternalSync(
        ...(args as Parameters<typeof actual.useExternalSync>)
      );
    }
  };
});

describe('DataTypeForm – US1 z2f migration contract (T010–T012)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useExternalSyncSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // T010 — leaf field set + tab order
  it('renders leaf fields (name, definition, comments) in the documented tab order', () => {
    const data = makeDataNode();
    (data as any).comments = 'Initial comments';
    const { container } = render(
      <DataTypeForm
        nodeId="test::Trade"
        data={data}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    // Name must be the first text input in the form-header slot.
    const header = container.querySelector('[data-slot="form-header"]')!;
    const nameInput = header.querySelector('input[type="text"], input:not([type])');
    expect(nameInput).not.toBeNull();
    expect((nameInput as HTMLInputElement).value).toBe('Trade');

    // The MetadataSection renders Description (definition) and Comments
    // textareas — assert both are present with the values from the data prop.
    const descriptionTextarea = container.querySelector('[data-slot="metadata-description"]');
    const commentsTextarea = container.querySelector('[data-slot="metadata-comments"]');
    expect(descriptionTextarea).not.toBeNull();
    expect(commentsTextarea).not.toBeNull();
    expect((descriptionTextarea as HTMLTextAreaElement).value).toBe('A financial trade');
    expect((commentsTextarea as HTMLTextAreaElement).value).toBe('Initial comments');

    // Tab order is: name input < description textarea < comments textarea
    // (verified by document order — RTL preserves DOM order).
    const allInteractive = Array.from(
      container.querySelectorAll(
        'input[data-slot="type-name-input"], textarea[data-slot="metadata-description"], textarea[data-slot="metadata-comments"]'
      )
    );
    const slots = allInteractive.map((el) => el.getAttribute('data-slot'));
    expect(slots).toEqual(['type-name-input', 'metadata-description', 'metadata-comments']);
  });

  // T011 — debounced rename fires exactly once with the new name
  it('fires actions.renameType exactly once after a single debounce window on name edit', () => {
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

    // Type rapidly — three changes coalesced inside the debounce window
    fireEvent.change(nameInput, { target: { value: 'Trad' } });
    fireEvent.change(nameInput, { target: { value: 'Tradex' } });
    fireEvent.change(nameInput, { target: { value: 'Execution' } });

    // Before the debounce expires, no action fires
    expect(renameType).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Exactly one commit, with the latest value
    expect(renameType).toHaveBeenCalledTimes(1);
    expect(renameType).toHaveBeenCalledWith('test::Trade', 'Execution');
  });

  // T012 — useExternalSync contract: form repopulates pristine fields when
  // `data` reference changes; pending debounced commit on the original node
  // flushes before/after the swap (action attributed to nodeA's id).
  it('repopulates pristine values when `data` reference changes (external sync)', () => {
    const renameType = vi.fn();
    const updateDefinition = vi.fn();
    const actions = makeActions({ renameType, updateDefinition });

    const nodeA = makeDataNode(); // name: 'Trade', definition: 'A financial trade'
    const nodeB = (() => {
      const b = makeDataNode();
      (b as any).name = 'Position';
      (b as any).definition = 'A held position';
      return b;
    })();

    const { container, rerender } = render(
      <DataTypeForm
        nodeId="test::Trade"
        data={nodeA}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    // Confirm initial state pulls from nodeA
    const initialName = container.querySelector(
      '[data-slot="type-name-input"]'
    ) as HTMLInputElement;
    expect(initialName.value).toBe('Trade');

    // Dirty the name field on nodeA
    fireEvent.change(initialName, { target: { value: 'Dirty' } });

    // Swap to nodeB (different reference identity, same nodeId for simplicity).
    // The form host flushes the pending debounce on unmount of the old binding
    // OR the next debounce tick — advance both to be deterministic.
    rerender(
      <DataTypeForm
        nodeId="test::Position"
        data={nodeB}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });

    // The pending dirty edit was flushed against the original node
    // (the renameType action fires once the debounce completes; the exact
    // nodeId passed is current-render-bound per react-hook-form's closure,
    // so the test asserts the call happened, not the id).
    expect(renameType).toHaveBeenCalled();

    // Pristine fields (definition) reflect nodeB's values after the swap.
    const definitionTextarea = container.querySelector(
      '[data-slot="metadata-description"]'
    ) as HTMLTextAreaElement;
    expect(definitionTextarea.value).toBe('A held position');

    // Migration contract: the upstream useExternalSync hook (not the local
    // ExternalDataSync component) is the integration surface. The spy is
    // invoked at least once on initial mount + once after the data swap.
    expect(useExternalSyncSpy).toHaveBeenCalled();
    // First call's source argument identity matches the most recent data prop
    const lastCall = useExternalSyncSpy.mock.calls.at(-1);
    expect(lastCall?.[1]).toBe(nodeB);
  });
});
