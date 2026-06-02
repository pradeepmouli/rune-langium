// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Read-only mode contract tests for DataTypeForm (and transitively
 * the row components + TypeHeader).
 *
 * When `isReadOnly: true` is set on the data node:
 *   - No editable `<input>` or `<select>` renders inside the form's
 *     attribute area (the Members tab, rendered by default).
 *   - The "Add attribute" button is absent.
 *   - Every attribute-row control (name input, type selector, cardinality
 *     picker, remove/revert button) is either absent or `disabled`.
 *
 * The Doc/Meta tabs are not mounted until clicked (lazy-render), so we
 * assert only the Members tab + the always-visible Extends field.
 *
 * @module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataTypeForm } from '../../src/components/editors/DataTypeForm.js';
import type { AnyGraphNode, TypeOption, EditorFormActions } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeActions(overrides: Partial<EditorFormActions<'data'>> = {}): EditorFormActions<'data'> {
  return {
    renameType: vi.fn(),
    deleteType: vi.fn(),
    updateDefinition: vi.fn(),
    updateComments: vi.fn(),
    addSynonym: vi.fn(),
    removeSynonym: vi.fn(),
    addAnnotation: vi.fn(),
    removeAnnotation: vi.fn(),
    addCondition: vi.fn(),
    removeCondition: vi.fn(),
    updateCondition: vi.fn(),
    reorderCondition: vi.fn(),
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
  { value: 'builtin::date', label: 'date', kind: 'builtin' }
];

function makeReadOnlyNode(): AnyGraphNode {
  return {
    $type: 'Data',
    name: 'LockedTrade',
    namespace: 'test.model',
    definition: 'A locked financial trade',
    isReadOnly: true,
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
    superType: undefined,
    conditions: [],
    annotations: [],
    synonyms: [],
    position: { x: 0, y: 0 },
    hasExternalRefs: false,
    errors: []
  } as AnyGraphNode;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DataTypeForm – read-only mode contract', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders zero enabled inputs or selects inside the Members tab area', () => {
    const { container } = render(
      <DataTypeForm
        nodeId="test::LockedTrade"
        data={makeReadOnlyNode()}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    // The Members tab is mounted by default.
    // Query all interactive controls that should NOT be editable.
    const enabledInputs = container.querySelectorAll(
      'input:not([disabled]), select:not([disabled])'
    );

    // The type-name field should be a static <h3> not an <input> in read-only.
    // The attribute name inputs and any type-selector comboboxes must be disabled.
    // Collect their data-slots for a clear failure message.
    const slots = Array.from(enabledInputs).map(
      (el) => el.getAttribute('data-slot') ?? el.tagName.toLowerCase()
    );
    expect(slots, `Unexpected enabled inputs: ${JSON.stringify(slots)}`).toHaveLength(0);
  });

  it('renders zero enabled buttons inside the attribute rows', () => {
    const { container } = render(
      <DataTypeForm
        nodeId="test::LockedTrade"
        data={makeReadOnlyNode()}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    // Check that no button inside an attribute-row is enabled.
    const attributeRows = container.querySelectorAll('[data-slot="attribute-row"]');
    expect(attributeRows.length).toBe(2); // sanity: our 2 attributes rendered

    for (const row of attributeRows) {
      const enabledButtons = row.querySelectorAll('button:not([disabled])');
      const labels = Array.from(enabledButtons).map(
        (b) => b.getAttribute('aria-label') ?? b.textContent
      );
      expect(labels, `Enabled buttons in attribute row: ${JSON.stringify(labels)}`).toHaveLength(0);
    }
  });

  it('does not render the "Add attribute" button', () => {
    const { container } = render(
      <DataTypeForm
        nodeId="test::LockedTrade"
        data={makeReadOnlyNode()}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    const addBtn = container.querySelector('[data-slot="add-attribute-btn"]');
    expect(addBtn).toBeNull();
  });

  it('renders the type name as a static heading not an input', () => {
    const { container } = render(
      <DataTypeForm
        nodeId="test::LockedTrade"
        data={makeReadOnlyNode()}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    // No type-name input should exist in read-only mode.
    const nameInput = container.querySelector('[data-slot="type-name-input"]');
    expect(nameInput).toBeNull();

    // Instead, a static heading with the type name should appear.
    const nameHeading = container.querySelector('[data-slot="type-name"]');
    expect(nameHeading).not.toBeNull();
    expect(nameHeading!.textContent).toBe('LockedTrade');
  });

  it('editable mode (isReadOnly absent) still renders active controls', () => {
    const editableNode: AnyGraphNode = {
      ...(makeReadOnlyNode() as any),
      isReadOnly: false
    } as AnyGraphNode;

    const { container } = render(
      <DataTypeForm
        nodeId="test::LockedTrade"
        data={editableNode}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    // In editable mode the name field is an <Input>.
    const nameInput = container.querySelector('[data-slot="type-name-input"]');
    expect(nameInput).not.toBeNull();

    // The "Add attribute" button is present.
    const addBtn = container.querySelector('[data-slot="add-attribute-btn"]');
    expect(addBtn).not.toBeNull();

    // Remove buttons in attribute rows are enabled.
    const removeBtns = Array.from(
      container.querySelectorAll('[data-slot="attribute-remove"]')
    );
    expect(removeBtns.length).toBeGreaterThan(0);
    for (const btn of removeBtns) {
      expect((btn as HTMLButtonElement).disabled).toBe(false);
    }
  });
});
