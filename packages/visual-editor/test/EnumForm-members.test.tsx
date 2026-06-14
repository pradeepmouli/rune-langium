// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for EnumForm list-style member editing (T031).
 *
 * Covers FR-015 (list-style member editing preserved within shared FormProvider):
 * - Clicking "Add Value" fires actions.addEnumValue with the correct args
 * - Clicking a row's remove button fires actions.removeEnumValue with the value name
 *
 * Written before migration (TDD) — validates list editing preserved through T034.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EnumForm } from '../src/components/editors/EnumForm.js';
import type { AnyGraphNode, TypeOption, EditorFormActions } from '../src/types.js';
import { testMeta } from './helpers/node-meta.js';

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

const AVAILABLE_TYPES: TypeOption[] = [];

function makeEnumData(overrides: Record<string, unknown> = {}): AnyGraphNode {
  return {
    $type: 'RosettaEnumeration',
    name: 'CurrencyEnum',
    namespace: 'test',
    enumValues: [
      { $type: 'RosettaEnumValue', name: 'USD', display: 'US Dollar' },
      { $type: 'RosettaEnumValue', name: 'EUR', display: 'Euro' }
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

describe('EnumForm — list-style member editing (T031, FR-015)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires addEnumValue with correct args when add-value button is clicked', () => {
    const actions = makeActions();
    render(<EnumForm meta={testMeta('test')} nodeId="node-1" data={makeEnumData()} availableTypes={AVAILABLE_TYPES} actions={actions} />);

    // Post-icon-button migration: add-value is an icon-only <Button>
    // with aria-label="Add value".
    const addBtn = screen.getByLabelText('Add value');
    fireEvent.click(addBtn);

    expect(actions.addEnumValue).toHaveBeenCalledWith('node-1', '', undefined);
  });

  it('fires removeEnumValue with the correct value name when a remove button is clicked', () => {
    const actions = makeActions();
    render(<EnumForm meta={testMeta('test')} nodeId="node-1" data={makeEnumData()} availableTypes={AVAILABLE_TYPES} actions={actions} />);

    const removeBtns = screen.getAllByLabelText(/remove value/i);
    fireEvent.click(removeBtns[0]!);

    expect(actions.removeEnumValue).toHaveBeenCalledWith('node-1', 'USD');
  });

  it('renders an empty-state message when members list is empty', () => {
    render(
      <EnumForm meta={testMeta('test')}
        nodeId="node-1"
        data={makeEnumData({ enumValues: [] })}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    expect(screen.getByText(/no values defined/i)).toBeDefined();
  });
});
