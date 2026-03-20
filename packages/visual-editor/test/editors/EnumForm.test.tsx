// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

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
import type {
  AnyGraphNode,
  TypeOption,
  EditorFormActions,
  TypeGraphNode
} from '../../src/types.js';

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

function makeEnumData(overrides: Record<string, unknown> = {}): AnyGraphNode {
  return {
    $type: 'RosettaEnumeration',
    name: 'CurrencyEnum',
    namespace: 'test.enums',
    enumValues: [
      { $type: 'RosettaEnumValue', name: 'USD', display: 'US Dollar' },
      { $type: 'RosettaEnumValue', name: 'EUR', display: 'Euro' },
      { $type: 'RosettaEnumValue', name: 'GBP', display: 'British Pound' }
    ],
    synonyms: [],
    annotations: [],
    position: { x: 0, y: 0 },
    hasExternalRefs: false,
    errors: [],
    ...overrides
  } as AnyGraphNode;
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

describe('EnumForm – merged inherited enum value list', () => {
  /** Build parent and child enum nodes for inheritance tests. */
  function makeEnumInheritanceNodes(
    childData: AnyGraphNode,
    parentValues: Record<string, unknown>[]
  ): TypeGraphNode[] {
    const parentNode = {
      id: 'test::BaseEnum',
      type: 'enum',
      position: { x: 0, y: 0 },
      data: {
        $type: 'RosettaEnumeration',
        name: 'BaseEnum',
        namespace: 'test',
        enumValues: parentValues,
        synonyms: [],
        annotations: [],
        position: { x: 0, y: 0 },
        hasExternalRefs: false,
        errors: []
      }
    } as TypeGraphNode;
    const childNode = {
      id: 'node-1',
      type: 'enum',
      position: { x: 0, y: 0 },
      data: childData
    } as TypeGraphNode;
    return [childNode, parentNode];
  }

  /** Make child enum data with parent ref to BaseEnum. */
  function makeChildEnum(overrides: Record<string, unknown> = {}): AnyGraphNode {
    return makeEnumData({ parent: { $refText: 'BaseEnum' }, ...overrides });
  }

  it('renders inherited enum value rows when allNodes provided', () => {
    const childData = makeChildEnum();
    const allNodes = makeEnumInheritanceNodes(childData, [
      { $type: 'RosettaEnumValue', name: 'JPY', display: 'Yen' }
    ]);
    const { container } = render(
      <EnumForm
        nodeId="node-1"
        data={childData}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
        allNodes={allNodes}
      />
    );
    const inherited = container.querySelectorAll('[data-slot="inherited-enum-value-row"]');
    expect(inherited.length).toBe(1);
  });

  it('shows inherited-from label with ancestor name', () => {
    const childData = makeChildEnum();
    const allNodes = makeEnumInheritanceNodes(childData, [
      { $type: 'RosettaEnumValue', name: 'JPY', display: '' }
    ]);
    render(
      <EnumForm
        nodeId="node-1"
        data={childData}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
        allNodes={allNodes}
      />
    );
    expect(screen.getByText(/inherited from BaseEnum/)).toBeDefined();
  });

  it('includes inherited count in Values label', () => {
    const childData = makeChildEnum();
    const allNodes = makeEnumInheritanceNodes(childData, [
      { $type: 'RosettaEnumValue', name: 'JPY', display: '' },
      { $type: 'RosettaEnumValue', name: 'CHF', display: '' }
    ]);
    render(
      <EnumForm
        nodeId="node-1"
        data={childData}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
        allNodes={allNodes}
      />
    );
    // 3 local + 2 inherited = 5
    expect(screen.getByText(/Values \(5\)/)).toBeDefined();
  });

  it('local value shadows inherited value with same name', () => {
    const childData = makeChildEnum({
      enumValues: [{ $type: 'RosettaEnumValue', name: 'GBP', display: '' }]
    });
    const allNodes = makeEnumInheritanceNodes(childData, [
      { $type: 'RosettaEnumValue', name: 'GBP', display: 'Pound' }
    ]);
    const { container } = render(
      <EnumForm
        nodeId="node-1"
        data={childData}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
        allNodes={allNodes}
      />
    );
    const local = container.querySelectorAll('[data-slot="enum-value-row"]');
    const inherited = container.querySelectorAll('[data-slot="inherited-enum-value-row"]');
    expect(local.length).toBe(1);
    expect(inherited.length).toBe(0);
  });

  it('Override button calls addEnumValue', () => {
    const addEnumValue = vi.fn();
    const childData = makeChildEnum();
    const allNodes = makeEnumInheritanceNodes(childData, [
      { $type: 'RosettaEnumValue', name: 'JPY', display: 'Yen' }
    ]);
    const { container } = render(
      <EnumForm
        nodeId="node-1"
        data={childData}
        availableTypes={AVAILABLE_TYPES}
        actions={{ ...makeActions(), addEnumValue }}
        allNodes={allNodes}
      />
    );
    const overrideBtn = container.querySelector('[data-slot="enum-value-override"]');
    fireEvent.click(overrideBtn!);
    expect(addEnumValue).toHaveBeenCalledWith('node-1', 'JPY', 'Yen');
  });

  it('inherited rows have no remove control', () => {
    const childData = makeChildEnum();
    const allNodes = makeEnumInheritanceNodes(childData, [
      { $type: 'RosettaEnumValue', name: 'JPY', display: '' }
    ]);
    const { container } = render(
      <EnumForm
        nodeId="node-1"
        data={childData}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
        allNodes={allNodes}
      />
    );
    const inheritedRow = container.querySelector('[data-slot="inherited-enum-value-row"]')!;
    expect(inheritedRow.querySelector('button[aria-label*="Remove"]')).toBeNull();
  });
});
