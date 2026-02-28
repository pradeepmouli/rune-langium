/**
 * Tests for EnumForm debounce behaviour and dirty-field preservation (T029).
 *
 * Covers FR-014 (debounce on rename) and FR-016 (keepDirtyValues / external update dirty-field preservation):
 * - renameType must NOT be called immediately on name change (debounce active)
 * - renameType must be called with the trimmed name after 500 ms
 * - When external data prop changes while the name field is dirty,
 *   the dirty value must NOT be overwritten by the incoming external value
 *
 * Written before migration (TDD) — validates behaviour preserved through T034.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { EnumForm } from '../src/components/editors/EnumForm.js';
import type { TypeNodeData, TypeOption, EditorFormActions } from '../src/types.js';

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
    addAnnotation: vi.fn(),
    removeAnnotation: vi.fn(),
    addEnumValue: vi.fn(),
    removeEnumValue: vi.fn(),
    updateEnumValue: vi.fn(),
    reorderEnumValue: vi.fn(),
    setEnumParent: vi.fn(),
    validate: vi.fn().mockReturnValue([])
  };
}

const AVAILABLE_TYPES: TypeOption[] = [
  { value: 'test::CurrencyEnum', label: 'CurrencyEnum', kind: 'enum', namespace: 'test' }
];

function makeEnumData(overrides: Partial<TypeNodeData<'enum'>> = {}): TypeNodeData<'enum'> {
  return {
    kind: 'enum',
    name: 'StatusEnum',
    namespace: 'test',
    members: [],
    hasExternalRefs: false,
    errors: [],
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EnumForm — debounce and dirty-field preservation (T029)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does NOT call renameType immediately on name change (debounce active)', () => {
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
    fireEvent.change(nameInput, { target: { value: 'NewName' } });

    expect(actions.renameType).not.toHaveBeenCalled();
  });

  it('calls renameType with the trimmed name after 500 ms (FR-016)', () => {
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
    fireEvent.change(nameInput, { target: { value: '  PaddedName  ' } });

    expect(actions.renameType).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(actions.renameType).toHaveBeenCalledWith('node-1', 'PaddedName');
  });

  it('does NOT overwrite dirty name field when external data prop changes (FR-014, FR-016)', () => {
    const actions = makeActions();
    const initialData = makeEnumData({ name: 'OriginalName' });

    const { rerender } = render(
      <EnumForm
        nodeId="node-1"
        data={initialData}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    // User types a new name — makes the name field dirty
    const nameInput = screen.getByLabelText(/type name/i);
    fireEvent.change(nameInput, { target: { value: 'UserTypedName' } });

    // Simulate an external data update (e.g. undo/redo from the graph store)
    const externalUpdate = makeEnumData({ name: 'ExternalUpdate' });
    rerender(
      <EnumForm
        nodeId="node-1"
        data={externalUpdate}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    // The dirty user-typed value must survive the external reset
    expect((screen.getByLabelText(/type name/i) as HTMLInputElement).value).toBe('UserTypedName');
  });
});
