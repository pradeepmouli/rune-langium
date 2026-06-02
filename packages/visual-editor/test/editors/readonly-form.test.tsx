// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Read-only mode contract tests for all type-specific form editors.
 *
 * Forms covered: DataTypeForm, EnumForm, ChoiceForm, FunctionForm, TypeAliasForm.
 *
 * When `isReadOnly: true` is set on the data node each form must:
 *   1. Render zero enabled `<input>`, `<textarea>`, or `<select>` elements.
 *   2. Render no mutating add/remove buttons (either absent or `disabled`).
 *   3. Show the type name as a static heading (`[data-slot="type-name"]`)
 *      rather than an editable input (`[data-slot="type-name-input"]`).
 *
 * DataTypeForm: only the Members tab is mounted by default; Doc/Meta tabs
 * are lazy-rendered and excluded from the assertion.
 *
 * @module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { DataTypeForm } from '../../src/components/editors/DataTypeForm.js';
import { EnumForm } from '../../src/components/editors/EnumForm.js';
import { ChoiceForm } from '../../src/components/editors/ChoiceForm.js';
import { FunctionForm } from '../../src/components/editors/FunctionForm.js';
import { TypeAliasForm } from '../../src/components/editors/TypeAliasForm.js';
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

  it('renders zero enabled inputs, textareas, or selects in the form', () => {
    const { container } = render(
      <DataTypeForm
        nodeId="test::LockedTrade"
        data={makeReadOnlyNode()}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    // The Members tab is mounted by default; Doc/Meta tabs are lazy.
    // Query all interactive controls that should NOT be editable.
    const enabledInputs = container.querySelectorAll(
      'input:not([disabled]), textarea:not([disabled]), select:not([disabled])'
    );

    // The type-name field should be a static <h3> not an <input> in read-only.
    // The attribute name inputs and any type-selector comboboxes must be disabled.
    // Collect their data-slots for a clear failure message.
    const slots = Array.from(enabledInputs).map((el) => el.getAttribute('data-slot') ?? el.tagName.toLowerCase());
    expect(slots, `Unexpected enabled inputs: ${JSON.stringify(slots)}`).toHaveLength(0);

    // Also assert the Extends TypeReferenceField picker trigger (a <button>)
    // is disabled — the selector trigger is a shadcn <button disabled>.
    const extendsField = container.querySelector('[data-slot="type-reference"]');
    expect(extendsField).not.toBeNull();
    const extendsTrigger = extendsField!.querySelector('[data-slot="type-selector"]');
    if (extendsTrigger) {
      // When a value is present, the trigger renders as a disabled button
      expect((extendsTrigger as HTMLButtonElement).disabled).toBe(true);
    }
    // When no value (as in this fixture with no superType), the TypeSelector
    // trigger still renders disabled — confirm no enabled button exists inside
    // the Extends area.
    const enabledExtendsButtons = extendsField!.querySelectorAll('button:not([disabled])');
    expect(enabledExtendsButtons, 'Extends field should have no enabled buttons').toHaveLength(0);
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
      const labels = Array.from(enabledButtons).map((b) => b.getAttribute('aria-label') ?? b.textContent);
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
    const removeBtns = Array.from(container.querySelectorAll('[data-slot="attribute-remove"]'));
    expect(removeBtns.length).toBeGreaterThan(0);
    for (const btn of removeBtns) {
      expect((btn as HTMLButtonElement).disabled).toBe(false);
    }
  });
});

// ===========================================================================
// EnumForm – read-only mode contract
// ===========================================================================

function makeEnumActions(): EditorFormActions<'enum'> {
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
    validate: vi.fn(() => [])
  };
}

const ENUM_AVAILABLE_TYPES: TypeOption[] = [
  { value: 'test.enums::CurrencyEnum', label: 'CurrencyEnum', kind: 'enum', namespace: 'test.enums' },
  { value: 'test.enums::RatingEnum', label: 'RatingEnum', kind: 'enum', namespace: 'test.enums' }
];

function makeReadOnlyEnumNode(): AnyGraphNode {
  return {
    $type: 'RosettaEnumeration',
    name: 'LockedCurrencyEnum',
    namespace: 'test.enums',
    isReadOnly: true,
    enumValues: [
      { $type: 'RosettaEnumValue', name: 'USD', display: 'US Dollar' },
      { $type: 'RosettaEnumValue', name: 'EUR', display: 'Euro' }
    ],
    synonyms: [],
    annotations: [],
    position: { x: 0, y: 0 },
    hasExternalRefs: false,
    errors: []
  } as AnyGraphNode;
}

describe('EnumForm – read-only mode contract', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders zero enabled inputs, textareas, or selects', () => {
    const { container } = render(
      <EnumForm
        nodeId="test.enums::LockedCurrencyEnum"
        data={makeReadOnlyEnumNode()}
        availableTypes={ENUM_AVAILABLE_TYPES}
        actions={makeEnumActions()}
      />
    );

    const enabledInputs = container.querySelectorAll(
      'input:not([disabled]), textarea:not([disabled]), select:not([disabled])'
    );
    const slots = Array.from(enabledInputs).map((el) => el.getAttribute('data-slot') ?? el.tagName.toLowerCase());
    expect(slots, `Unexpected enabled inputs: ${JSON.stringify(slots)}`).toHaveLength(0);
  });

  it('does not render the "Add value" button', () => {
    const { container } = render(
      <EnumForm
        nodeId="test.enums::LockedCurrencyEnum"
        data={makeReadOnlyEnumNode()}
        availableTypes={ENUM_AVAILABLE_TYPES}
        actions={makeEnumActions()}
      />
    );
    expect(container.querySelector('[data-slot="add-value-btn"]')).toBeNull();
  });

  it('renders zero enabled buttons inside enum value rows', () => {
    const { container } = render(
      <EnumForm
        nodeId="test.enums::LockedCurrencyEnum"
        data={makeReadOnlyEnumNode()}
        availableTypes={ENUM_AVAILABLE_TYPES}
        actions={makeEnumActions()}
      />
    );
    const rows = container.querySelectorAll('[data-slot="enum-value-row"]');
    expect(rows.length).toBe(2);
    for (const row of rows) {
      const enabledBtns = row.querySelectorAll('button:not([disabled])');
      const labels = Array.from(enabledBtns).map((b) => b.getAttribute('aria-label') ?? b.textContent);
      expect(labels, `Enabled buttons in enum row: ${JSON.stringify(labels)}`).toHaveLength(0);
    }
  });

  it('renders the type name as a static heading not an input', () => {
    const { container } = render(
      <EnumForm
        nodeId="test.enums::LockedCurrencyEnum"
        data={makeReadOnlyEnumNode()}
        availableTypes={ENUM_AVAILABLE_TYPES}
        actions={makeEnumActions()}
      />
    );
    expect(container.querySelector('[data-slot="type-name-input"]')).toBeNull();
    const nameHeading = container.querySelector('[data-slot="type-name"]');
    expect(nameHeading).not.toBeNull();
    expect(nameHeading!.textContent).toBe('LockedCurrencyEnum');
  });

  it('parent enum TypeReferenceField has no enabled selector', () => {
    const { container } = render(
      <EnumForm
        nodeId="test.enums::LockedCurrencyEnum"
        data={makeReadOnlyEnumNode()}
        availableTypes={ENUM_AVAILABLE_TYPES}
        actions={makeEnumActions()}
      />
    );
    // The Extends TypeReferenceField should have no enabled picker buttons.
    const typeRef = container.querySelector('[data-slot="type-reference"]');
    expect(typeRef).not.toBeNull();
    const enabledBtns = typeRef!.querySelectorAll('button:not([disabled])');
    expect(enabledBtns.length, 'Extends field should have no enabled buttons').toBe(0);
  });
});

// ===========================================================================
// ChoiceForm – read-only mode contract
// ===========================================================================

function makeChoiceActions(): EditorFormActions<'choice'> {
  return {
    renameType: vi.fn(),
    deleteType: vi.fn(),
    updateDefinition: vi.fn(),
    updateComments: vi.fn(),
    addSynonym: vi.fn(),
    removeSynonym: vi.fn(),
    addChoiceOption: vi.fn(),
    removeChoiceOption: vi.fn(),
    validate: vi.fn(() => [])
  };
}

const CHOICE_AVAILABLE_TYPES: TypeOption[] = [
  { value: 'test.model::CashPayment', label: 'CashPayment', kind: 'data', namespace: 'test.model' },
  { value: 'test.model::PhysicalSettlement', label: 'PhysicalSettlement', kind: 'data', namespace: 'test.model' }
];

function makeReadOnlyChoiceNode(): AnyGraphNode {
  return {
    $type: 'Choice',
    name: 'LockedPaymentType',
    namespace: 'test.model',
    isReadOnly: true,
    attributes: [
      { $type: 'ChoiceOption', typeCall: { $type: 'TypeCall', type: { $refText: 'CashPayment' } } },
      { $type: 'ChoiceOption', typeCall: { $type: 'TypeCall', type: { $refText: 'PhysicalSettlement' } } }
    ],
    conditions: [],
    annotations: [],
    synonyms: [],
    position: { x: 0, y: 0 },
    hasExternalRefs: false,
    errors: []
  } as AnyGraphNode;
}

describe('ChoiceForm – read-only mode contract', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders zero enabled inputs, textareas, or selects', () => {
    const { container } = render(
      <ChoiceForm
        nodeId="test.model::LockedPaymentType"
        data={makeReadOnlyChoiceNode()}
        availableTypes={CHOICE_AVAILABLE_TYPES}
        actions={makeChoiceActions()}
      />
    );

    const enabledInputs = container.querySelectorAll(
      'input:not([disabled]), textarea:not([disabled]), select:not([disabled])'
    );
    const slots = Array.from(enabledInputs).map((el) => el.getAttribute('data-slot') ?? el.tagName.toLowerCase());
    expect(slots, `Unexpected enabled inputs: ${JSON.stringify(slots)}`).toHaveLength(0);
  });

  it('does not render the "add-option" selector', () => {
    const { container } = render(
      <ChoiceForm
        nodeId="test.model::LockedPaymentType"
        data={makeReadOnlyChoiceNode()}
        availableTypes={CHOICE_AVAILABLE_TYPES}
        actions={makeChoiceActions()}
      />
    );
    expect(container.querySelector('[data-slot="add-option"]')).toBeNull();
  });

  it('renders zero enabled buttons inside choice option rows', () => {
    const { container } = render(
      <ChoiceForm
        nodeId="test.model::LockedPaymentType"
        data={makeReadOnlyChoiceNode()}
        availableTypes={CHOICE_AVAILABLE_TYPES}
        actions={makeChoiceActions()}
      />
    );
    const rows = container.querySelectorAll('[data-slot="choice-option-row"]');
    expect(rows.length).toBe(2);
    for (const row of rows) {
      // TypeLink nav arrows (data-slot="type-link") are navigation-only — skip them.
      const enabledMutatingBtns = Array.from(row.querySelectorAll('button:not([disabled])')).filter(
        (b) =>
          b.getAttribute('data-slot') !== 'type-link' && b.getAttribute('aria-label')?.toLowerCase().includes('remove')
      );
      expect(
        enabledMutatingBtns.length,
        `Enabled remove buttons in choice row: ${enabledMutatingBtns.map((b) => b.getAttribute('aria-label')).join(', ')}`
      ).toBe(0);
    }
  });

  it('renders the type name as a static heading not an input', () => {
    const { container } = render(
      <ChoiceForm
        nodeId="test.model::LockedPaymentType"
        data={makeReadOnlyChoiceNode()}
        availableTypes={CHOICE_AVAILABLE_TYPES}
        actions={makeChoiceActions()}
      />
    );
    expect(container.querySelector('[data-slot="type-name-input"]')).toBeNull();
    const nameHeading = container.querySelector('[data-slot="type-name"]');
    expect(nameHeading).not.toBeNull();
    expect(nameHeading!.textContent).toBe('LockedPaymentType');
  });
});

// ===========================================================================
// FunctionForm – read-only mode contract
// ===========================================================================

function makeFuncActions(): EditorFormActions<'func'> {
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
    addAnnotation: vi.fn(),
    removeAnnotation: vi.fn(),
    addCondition: vi.fn(),
    removeCondition: vi.fn(),
    updateCondition: vi.fn(),
    reorderCondition: vi.fn(),
    validate: vi.fn(() => [])
  };
}

const FUNC_AVAILABLE_TYPES: TypeOption[] = [
  { value: 'test.model::Trade', label: 'Trade', kind: 'data', namespace: 'test.model' },
  { value: 'builtin::number', label: 'number', kind: 'builtin' },
  { value: 'builtin::string', label: 'string', kind: 'builtin' }
];

function makeReadOnlyFuncNode(): AnyGraphNode {
  return {
    $type: 'RosettaFunction',
    name: 'LockedCalculateNotional',
    namespace: 'test.model',
    isReadOnly: true,
    inputs: [
      {
        $type: 'Attribute',
        name: 'trade',
        typeCall: { $type: 'TypeCall', type: { $refText: 'Trade' } },
        card: { inf: 1, sup: 1, unbounded: false },
        override: false
      }
    ],
    output: { typeCall: { $type: 'TypeCall', type: { $refText: 'number' } } },
    // Keep expressionText + operations/shortcuts empty so the fallback plain
    // textarea branch renders (empty-state branch) — our req-1 check validates it.
    expressionText: '',
    shortcuts: [],
    operations: [],
    conditions: [],
    postConditions: [],
    annotations: [],
    synonyms: [],
    position: { x: 0, y: 0 },
    hasExternalRefs: false,
    errors: []
  } as AnyGraphNode;
}

describe('FunctionForm – read-only mode contract', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders zero enabled inputs, textareas, or selects', () => {
    const { container } = render(
      <FunctionForm
        nodeId="test.model::LockedCalculateNotional"
        data={makeReadOnlyFuncNode()}
        availableTypes={FUNC_AVAILABLE_TYPES}
        actions={makeFuncActions()}
      />
    );

    const enabledInputs = container.querySelectorAll(
      'input:not([disabled]), textarea:not([disabled]), select:not([disabled])'
    );
    const slots = Array.from(enabledInputs).map((el) => el.getAttribute('data-slot') ?? el.tagName.toLowerCase());
    expect(slots, `Unexpected enabled inputs: ${JSON.stringify(slots)}`).toHaveLength(0);
  });

  it('does not render the add-input row controls', () => {
    const { container } = render(
      <FunctionForm
        nodeId="test.model::LockedCalculateNotional"
        data={makeReadOnlyFuncNode()}
        availableTypes={FUNC_AVAILABLE_TYPES}
        actions={makeFuncActions()}
      />
    );
    // The add-input button and name field must be absent in read-only mode.
    expect(container.querySelector('[data-slot="add-input-btn"]')).toBeNull();
    expect(container.querySelector('[data-slot="add-param-name"]')).toBeNull();
  });

  it('renders zero enabled buttons inside input param rows', () => {
    const { container } = render(
      <FunctionForm
        nodeId="test.model::LockedCalculateNotional"
        data={makeReadOnlyFuncNode()}
        availableTypes={FUNC_AVAILABLE_TYPES}
        actions={makeFuncActions()}
      />
    );
    const rows = container.querySelectorAll('[data-slot="input-param-row"]');
    expect(rows.length).toBe(1);
    for (const row of rows) {
      // TypeLink nav arrows are navigation-only — filter to remove buttons.
      const enabledRemoveBtns = Array.from(row.querySelectorAll('button:not([disabled])')).filter((b) =>
        b.getAttribute('aria-label')?.toLowerCase().includes('remove')
      );
      expect(
        enabledRemoveBtns.length,
        `Enabled remove buttons in input-param row: ${enabledRemoveBtns.map((b) => b.getAttribute('aria-label')).join(', ')}`
      ).toBe(0);
    }
  });

  it('renders the type name as a static heading not an input', () => {
    const { container } = render(
      <FunctionForm
        nodeId="test.model::LockedCalculateNotional"
        data={makeReadOnlyFuncNode()}
        availableTypes={FUNC_AVAILABLE_TYPES}
        actions={makeFuncActions()}
      />
    );
    expect(container.querySelector('[data-slot="type-name-input"]')).toBeNull();
    const nameHeading = container.querySelector('[data-slot="type-name"]');
    expect(nameHeading).not.toBeNull();
    expect(nameHeading!.textContent).toBe('LockedCalculateNotional');
  });

  it('output TypeReferenceField has no enabled selector', () => {
    const { container } = render(
      <FunctionForm
        nodeId="test.model::LockedCalculateNotional"
        data={makeReadOnlyFuncNode()}
        availableTypes={FUNC_AVAILABLE_TYPES}
        actions={makeFuncActions()}
      />
    );
    // The output TypeReferenceField picker must not render any enabled buttons.
    const typeRefs = container.querySelectorAll('[data-slot="type-reference"]');
    // The output field is the only TypeReferenceField in this form (no superType).
    expect(typeRefs.length).toBeGreaterThanOrEqual(1);
    for (const ref of typeRefs) {
      // No enabled buttons inside any TypeReferenceField.
      const enabledBtns = ref.querySelectorAll('button:not([disabled])');
      expect(
        enabledBtns.length,
        `Enabled buttons in type-reference: ${Array.from(enabledBtns)
          .map((b) => b.getAttribute('aria-label'))
          .join(', ')}`
      ).toBe(0);
    }
  });
});

// ===========================================================================
// TypeAliasForm – read-only mode contract
// ===========================================================================

function makeTypeAliasActions(): EditorFormActions<'typeAlias'> {
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
    validate: vi.fn(() => [])
  };
}

const TYPE_ALIAS_AVAILABLE_TYPES: TypeOption[] = [
  { value: 'builtin::string', label: 'string', kind: 'builtin' },
  { value: 'builtin::int', label: 'int', kind: 'builtin' }
];

function makeReadOnlyTypeAliasNode(): AnyGraphNode {
  return {
    $type: 'RosettaTypeAlias',
    name: 'LockedShortText',
    namespace: 'test.aliases',
    isReadOnly: true,
    definition: 'A locked type alias',
    typeCall: {
      $type: 'TypeCall',
      type: { $refText: 'string' }
    },
    position: { x: 0, y: 0 },
    hasExternalRefs: false,
    errors: []
  } as AnyGraphNode;
}

describe('TypeAliasForm – read-only mode contract', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders zero enabled inputs, textareas, or selects', () => {
    const { container } = render(
      <TypeAliasForm
        nodeId="test.aliases::LockedShortText"
        data={makeReadOnlyTypeAliasNode()}
        availableTypes={TYPE_ALIAS_AVAILABLE_TYPES}
        actions={makeTypeAliasActions()}
      />
    );

    const enabledInputs = container.querySelectorAll(
      'input:not([disabled]), textarea:not([disabled]), select:not([disabled])'
    );
    const slots = Array.from(enabledInputs).map((el) => el.getAttribute('data-slot') ?? el.tagName.toLowerCase());
    expect(slots, `Unexpected enabled inputs: ${JSON.stringify(slots)}`).toHaveLength(0);
  });

  it('renders the type name as a static heading not an input', () => {
    const { container } = render(
      <TypeAliasForm
        nodeId="test.aliases::LockedShortText"
        data={makeReadOnlyTypeAliasNode()}
        availableTypes={TYPE_ALIAS_AVAILABLE_TYPES}
        actions={makeTypeAliasActions()}
      />
    );
    expect(container.querySelector('[data-slot="type-name-input"]')).toBeNull();
    const nameHeading = container.querySelector('[data-slot="type-name"]');
    expect(nameHeading).not.toBeNull();
    expect(nameHeading!.textContent).toBe('LockedShortText');
  });

  it('wrapped-type TypeReferenceField has no enabled selector', () => {
    const { container } = render(
      <TypeAliasForm
        nodeId="test.aliases::LockedShortText"
        data={makeReadOnlyTypeAliasNode()}
        availableTypes={TYPE_ALIAS_AVAILABLE_TYPES}
        actions={makeTypeAliasActions()}
      />
    );
    const typeRef = container.querySelector('[data-slot="type-reference"]');
    expect(typeRef).not.toBeNull();
    // No enabled picker button inside the type reference field.
    const enabledBtns = typeRef!.querySelectorAll('button:not([disabled])');
    expect(
      enabledBtns.length,
      `Enabled buttons in wrapped-type reference: ${Array.from(enabledBtns)
        .map((b) => b.getAttribute('aria-label'))
        .join(', ')}`
    ).toBe(0);
  });
});
