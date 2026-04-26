// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Integration tests for TypeAliasForm component (Phase 5d / US3).
 *
 * Phase 5d migrates `TypeAliasForm.tsx` to the Phase-3 z2f template:
 * - `useZodForm(RosettaTypeAliasSchema, { defaultValues: data })` per R11
 * - `useExternalSync(form, data, (n) => n)` for pristine field re-bind
 * - `<EditorActionsProvider>` so declaratively-rendered sections derive
 *   their commit callbacks from `EditorFormActions` + `nodeId`
 * - The wrapped `typeCall.type` reference is the TypeAlias-specific
 *   primary affordance (a `<TypeSelector>` exposed in the form body)
 *
 * Tests:
 * - **TAT1**: leaf field labels + tab order (name first, wrapped type next)
 * - **TAT2**: rename debounces and fires `actions.renameType` exactly once
 * - **TAT3**: external sync repopulates pristine values when `data`
 *   reference changes
 * - **TAT4** (TypeAlias-specific): selecting a wrapped type via the
 *   `<TypeSelector>` updates the form's `typeCall.type` field
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { AnyGraphNode, EditorFormActions, TypeOption } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Mock TypeSelector to expose its `onSelect` via a deterministic test
// affordance. The real TypeSelector falls back to a Radix Select which
// renders inside a Portal and is awkward to drive with fireEvent in jsdom.
// The mock keeps the same `data-slot="type-selector"` so visual-shape
// assertions (TAT1) remain meaningful, and adds per-option buttons keyed
// by `data-slot="type-selector-option-<value>"` so TAT4 can dispatch a
// real selection.
// ---------------------------------------------------------------------------

vi.mock('../../src/components/editors/TypeSelector.js', () => ({
  TypeSelector: ({
    value,
    options = [],
    onSelect
  }: {
    value: string | null;
    options?: TypeOption[];
    onSelect: (val: string | null) => void;
  }) => (
    <div data-slot="type-selector" data-value={value ?? ''}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          data-slot={`type-selector-option-${opt.value}`}
          onClick={() => onSelect(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}));

import { TypeAliasForm } from '../../src/components/editors/TypeAliasForm.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeActions(
  overrides: Partial<EditorFormActions<'typeAlias'>> = {}
): EditorFormActions<'typeAlias'> {
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
    validate: vi.fn(() => []),
    ...overrides
  };
}

const AVAILABLE_TYPES: TypeOption[] = [
  { value: 'builtin::string', label: 'string', kind: 'builtin' },
  { value: 'builtin::int', label: 'int', kind: 'builtin' },
  { value: 'test.model::Trade', label: 'Trade', kind: 'data', namespace: 'test.model' }
];

function makeTypeAliasNode(overrides: Record<string, unknown> = {}): AnyGraphNode {
  return {
    $type: 'RosettaTypeAlias',
    name: 'ShortText',
    namespace: 'test.aliases',
    definition: 'A short text alias',
    typeCall: {
      $type: 'TypeCall',
      type: { $refText: 'string' }
    },
    position: { x: 0, y: 0 },
    hasExternalRefs: false,
    errors: [],
    ...overrides
  } as AnyGraphNode;
}

// ---------------------------------------------------------------------------
// useExternalSync spy — asserts the upstream hook is the integration surface
// (mirrors the DataTypeForm.test.tsx contract from Phase 3 / US1).
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TypeAliasForm – Phase 5d / US3 z2f migration contract', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useExternalSyncSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // TAT1 — leaf field labels + tab order (name + wrapped type)
  // -------------------------------------------------------------------------
  it('TAT1: renders the name + wrapped-type leaf fields in the documented tab order', () => {
    const actions = makeActions();
    const { container } = render(
      <TypeAliasForm
        nodeId="test.aliases::ShortText"
        data={makeTypeAliasNode()}
        actions={actions}
        availableTypes={AVAILABLE_TYPES}
      />
    );

    // Name input is the first interactive element in the form-header slot.
    const header = container.querySelector('[data-slot="form-header"]')!;
    expect(header).not.toBeNull();
    const nameInput = header.querySelector('input[data-slot="type-name-input"]');
    expect(nameInput).not.toBeNull();
    expect((nameInput as HTMLInputElement).value).toBe('ShortText');

    // The wrapped-type selector is the TypeAlias-specific primary affordance.
    const typeSelector = container.querySelector('[data-slot="type-selector"]');
    expect(typeSelector).not.toBeNull();

    // Tab order: name input < type selector (verified by document order;
    // RTL preserves DOM order).
    const interactive = Array.from(
      container.querySelectorAll('input[data-slot="type-name-input"], [data-slot="type-selector"]')
    );
    expect(interactive.map((el) => el.getAttribute('data-slot'))).toEqual([
      'type-name-input',
      'type-selector'
    ]);
  });

  // -------------------------------------------------------------------------
  // TAT2 — rename debounce → action
  // -------------------------------------------------------------------------
  it('TAT2: fires actions.renameType exactly once after the debounce window on name edit', () => {
    const renameType = vi.fn();
    const actions = makeActions({ renameType });

    render(
      <TypeAliasForm
        nodeId="test.aliases::ShortText"
        data={makeTypeAliasNode()}
        actions={actions}
        availableTypes={AVAILABLE_TYPES}
      />
    );

    const nameInput = screen.getByLabelText(/type alias name/i);

    // Three rapid changes coalesced inside the 500ms debounce window
    fireEvent.change(nameInput, { target: { value: 'Short' } });
    fireEvent.change(nameInput, { target: { value: 'ShortTxt' } });
    fireEvent.change(nameInput, { target: { value: 'TinyText' } });

    expect(renameType).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(renameType).toHaveBeenCalledTimes(1);
    expect(renameType).toHaveBeenCalledWith('test.aliases::ShortText', 'TinyText');
  });

  // -------------------------------------------------------------------------
  // TAT3 — external sync on data swap
  // -------------------------------------------------------------------------
  it('TAT3: repopulates pristine values when `data` reference changes (external sync)', () => {
    const actions = makeActions();

    const nodeA = makeTypeAliasNode(); // name: 'ShortText'
    const nodeB = makeTypeAliasNode({
      name: 'TinyInt',
      typeCall: { $type: 'TypeCall', type: { $refText: 'int' } }
    });

    const { container, rerender } = render(
      <TypeAliasForm
        nodeId="test.aliases::ShortText"
        data={nodeA}
        actions={actions}
        availableTypes={AVAILABLE_TYPES}
      />
    );

    // Initial state pulled from nodeA
    const initialName = container.querySelector(
      '[data-slot="type-name-input"]'
    ) as HTMLInputElement;
    expect(initialName.value).toBe('ShortText');

    // Swap to nodeB (different reference identity)
    rerender(
      <TypeAliasForm
        nodeId="test.aliases::TinyInt"
        data={nodeB}
        actions={actions}
        availableTypes={AVAILABLE_TYPES}
      />
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Pristine field reflects nodeB after the swap
    const swappedName = container.querySelector(
      '[data-slot="type-name-input"]'
    ) as HTMLInputElement;
    expect(swappedName.value).toBe('TinyInt');

    // Migration contract — the upstream useExternalSync hook is the
    // integration surface.
    expect(useExternalSyncSpy).toHaveBeenCalled();
    const lastCall = useExternalSyncSpy.mock.calls.at(-1);
    expect(lastCall?.[1]).toBe(nodeB);
  });

  // -------------------------------------------------------------------------
  // TAT4 — selecting a wrapped type via TypeSelector updates the form
  // -------------------------------------------------------------------------
  it('TAT4: selecting a wrapped type via TypeSelector updates the form `typeCall.type`', () => {
    const actions = makeActions();
    const { container } = render(
      <TypeAliasForm
        nodeId="test.aliases::ShortText"
        data={makeTypeAliasNode()}
        actions={actions}
        availableTypes={AVAILABLE_TYPES}
      />
    );

    const typeSelector = container.querySelector('[data-slot="type-selector"]');
    expect(typeSelector).not.toBeNull();
    // Initial wrapped-type value is reflected in the selector
    expect(typeSelector!.getAttribute('data-value')).toBe('builtin::string');

    // Pick a different built-in type via the mocked TypeSelector affordance.
    const intOption = container.querySelector('[data-slot="type-selector-option-builtin::int"]');
    expect(intOption).not.toBeNull();
    fireEvent.click(intOption as HTMLElement);

    // The selector now reflects the new selection (the form rebinds the
    // controlled value through `currentTypeValue`).
    const updatedSelector = container.querySelector('[data-slot="type-selector"]');
    expect(updatedSelector!.getAttribute('data-value')).toBe('builtin::int');

    // The `typeCall.arguments` path stays hidden (no arguments rendered).
    const argsSlot = container.querySelector('[data-slot="typecall-arguments"]');
    expect(argsSlot).toBeNull();
  });
});
