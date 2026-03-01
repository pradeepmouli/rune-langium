/**
 * Smoke-test regression guard for hand-authored (non-migrated) editor forms (T030).
 *
 * Verifies that ChoiceForm, DataTypeForm, and FunctionForm still render without
 * throwing after the EnumForm migration. Guards against accidental breakage
 * from shared imports, schema changes, or type regressions (FR-017).
 *
 * Each test renders the form with minimal valid props and asserts no error is thrown.
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ChoiceForm } from '../src/components/editors/ChoiceForm.js';
import { DataTypeForm } from '../src/components/editors/DataTypeForm.js';
import { FunctionForm } from '../src/components/editors/FunctionForm.js';
import type { TypeNodeData, TypeOption, EditorFormActions } from '../src/types.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const AVAILABLE_TYPES: TypeOption[] = [
  { value: 'test::Money', label: 'Money', kind: 'data', namespace: 'test' },
  { value: 'test::string', label: 'string', kind: 'builtin' }
];

/** Build a minimal TypeNodeData fixture for any kind. */
function makeData<K extends 'choice' | 'data' | 'func'>(kind: K, name: string): TypeNodeData<K> {
  return {
    kind,
    name,
    namespace: 'test',
    members: [],
    hasExternalRefs: false,
    errors: []
  } as TypeNodeData<K>;
}

/** Create a minimal all-vi.fn() action map compatible with any form kind. */
function makeChoiceActions(): EditorFormActions<'choice'> {
  return {
    renameType: vi.fn(),
    deleteType: vi.fn(),
    updateDefinition: vi.fn(),
    updateComments: vi.fn(),
    addSynonym: vi.fn(),
    removeSynonym: vi.fn(),
    addAnnotation: vi.fn(),
    removeAnnotation: vi.fn(),
    addChoiceOption: vi.fn(),
    removeChoiceOption: vi.fn(),
    validate: vi.fn().mockReturnValue([])
  };
}

function makeDataActions(): EditorFormActions<'data'> {
  return {
    renameType: vi.fn(),
    deleteType: vi.fn(),
    updateDefinition: vi.fn(),
    updateComments: vi.fn(),
    addSynonym: vi.fn(),
    removeSynonym: vi.fn(),
    addAnnotation: vi.fn(),
    removeAnnotation: vi.fn(),
    addAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    updateAttribute: vi.fn(),
    reorderAttribute: vi.fn(),
    setInheritance: vi.fn(),
    validate: vi.fn().mockReturnValue([])
  };
}

function makeFuncActions(): EditorFormActions<'func'> {
  return {
    renameType: vi.fn(),
    deleteType: vi.fn(),
    updateDefinition: vi.fn(),
    updateComments: vi.fn(),
    addSynonym: vi.fn(),
    removeSynonym: vi.fn(),
    addAnnotation: vi.fn(),
    removeAnnotation: vi.fn(),
    addInputParam: vi.fn(),
    removeInputParam: vi.fn(),
    updateOutputType: vi.fn(),
    updateExpression: vi.fn(),
    validate: vi.fn().mockReturnValue([])
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Non-migrated forms regression guard (T030, FR-017)', () => {
  it('ChoiceForm renders without throwing with minimal props', () => {
    expect(() =>
      render(
        <ChoiceForm
          nodeId="node-choice"
          data={makeData('choice', 'PaymentMethod')}
          availableTypes={AVAILABLE_TYPES}
          actions={makeChoiceActions()}
        />
      )
    ).not.toThrow();
  });

  it('DataTypeForm renders without throwing with minimal props', () => {
    expect(() =>
      render(
        <DataTypeForm
          nodeId="node-data"
          data={makeData('data', 'Party')}
          availableTypes={AVAILABLE_TYPES}
          actions={makeDataActions()}
        />
      )
    ).not.toThrow();
  });

  it('FunctionForm renders without throwing with minimal props', () => {
    expect(() =>
      render(
        <FunctionForm
          nodeId="node-func"
          data={makeData('func', 'Calculate')}
          availableTypes={AVAILABLE_TYPES}
          actions={makeFuncActions()}
        />
      )
    ).not.toThrow();
  });

  it('ChoiceForm accepts its original prop shape (nodeId, data, availableTypes, actions)', () => {
    // Verifies the prop interface has not regressed
    const data = makeData('choice', 'Settlement');
    const actions = makeChoiceActions();
    // render → no TS error here means the prop types are intact
    expect(() =>
      render(<ChoiceForm nodeId="n1" data={data} availableTypes={[]} actions={actions} />)
    ).not.toThrow();
  });

  it('DataTypeForm accepts its original prop shape (nodeId, data, availableTypes, actions)', () => {
    const data = makeData('data', 'Counterparty');
    const actions = makeDataActions();
    expect(() =>
      render(<DataTypeForm nodeId="n2" data={data} availableTypes={[]} actions={actions} />)
    ).not.toThrow();
  });

  it('FunctionForm accepts its original prop shape (nodeId, data, availableTypes, actions)', () => {
    const data = makeData('func', 'Evaluate');
    const actions = makeFuncActions();
    expect(() =>
      render(<FunctionForm nodeId="n3" data={data} availableTypes={[]} actions={actions} />)
    ).not.toThrow();
  });
});
