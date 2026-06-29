// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Unit tests for EnumValueRow component (T049).
 *
 * Covers:
 * - Name/displayName rendering
 * - Auto-save debounce on name change
 * - Remove callback
 * - Drag reorder callback
 * - Empty name validation (red border)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import { EnumValueRow } from '../../src/components/editors/EnumValueRow.js';
import { EditorActionsProvider } from '../../src/components/forms/sections/EditorActionsContext.js';
import type { SourceRefOption } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    name: 'USD',
    displayName: 'US Dollar',
    nodeId: 'node-1',
    index: 0,
    onUpdate: vi.fn(),
    onRemove: vi.fn(),
    onReorder: vi.fn(),
    ...overrides
  };
}

/** Wraps the component in a FormProvider seeded with AST-shaped enum value
 *  records. Per R11 (013-z2f-editor-migration), EnumValueRow now reads
 *  `enumValues.${index}.{name,display}` directly. */
function Wrapper({ name, displayName, children }: { name: string; displayName: string; children: React.ReactNode }) {
  const form = useForm({
    defaultValues: {
      enumValues: [{ $type: 'RosettaEnumValue', name, display: displayName }]
    }
  });
  return <FormProvider {...form}>{children}</FormProvider>;
}

function renderRow(props: ReturnType<typeof baseProps>) {
  return render(
    <Wrapper name={props.name as string} displayName={props.displayName as string}>
      <EnumValueRow {...props} />
    </Wrapper>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EnumValueRow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces name changes with 500ms delay', () => {
    const props = baseProps();
    renderRow(props);

    const nameInput = screen.getByLabelText(/value name/i);
    fireEvent.change(nameInput, { target: { value: 'US_Dollar' } });

    // Not committed yet
    expect(props.onUpdate).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(props.onUpdate).toHaveBeenCalledOnce();
    expect(props.onUpdate).toHaveBeenCalledWith('node-1', 'USD', 'US_Dollar', 'US Dollar');
  });

  it('debounces display name changes', () => {
    const props = baseProps();
    renderRow(props);

    const displayInput = screen.getByPlaceholderText(/display name/i);
    fireEvent.change(displayInput, { target: { value: 'United States Dollar' } });

    expect(props.onUpdate).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(props.onUpdate).toHaveBeenCalledOnce();
    expect(props.onUpdate).toHaveBeenCalledWith('node-1', 'USD', 'USD', 'United States Dollar');
  });

  it('calls onRemove when remove button is clicked', () => {
    const props = baseProps();
    renderRow(props);

    const removeBtn = screen.getByLabelText(/remove value/i);
    fireEvent.click(removeBtn);

    expect(props.onRemove).toHaveBeenCalledWith('node-1', 'USD');
  });

  it('shows destructive border for empty name', () => {
    renderRow(baseProps({ name: '' }));

    const nameInput = screen.getByLabelText(/value name/i);
    // Token-backed border per R12 (was `border-red-500` before T077).
    expect(nameInput.className).toContain('border-destructive');
  });

  it('disables inputs when disabled prop is true', () => {
    renderRow(baseProps({ disabled: true }));

    const nameInput = screen.getByLabelText(/value name/i);
    expect(nameInput).toHaveProperty('disabled', true);
  });
});

// ---------------------------------------------------------------------------
// Synonym tests (Task 6)
// Tests cover BOTH inverse halves of the cross-ns qualify rule (plan L15):
//   same-ns  → bare label written to $refText  (local-stays-bare half)
//   cross-ns → qualified `${ns}.${name}` written to $refText (qualify half)
// ---------------------------------------------------------------------------

// Same-namespace option: host 'ns.Color', source 'ns.FIX' → same ns
const SAME_NS_OPTIONS: SourceRefOption[] = [{ value: 'ns.FIX', label: 'FIX', namespace: 'ns' }];

// Cross-namespace option: host 'ns.Color', source 'other.FpML' → different ns
const CROSS_NS_OPTIONS: SourceRefOption[] = [{ value: 'other.FpML', label: 'FpML', namespace: 'other' }];

/** FormProvider seeded with enumSynonyms at the expected AST path. */
function SynonymWrapper({
  children,
  enumSynonyms = []
}: {
  children: React.ReactNode;
  enumSynonyms?: unknown[];
}) {
  const form = useForm({
    defaultValues: {
      enumValues: [{ $type: 'RosettaEnumValue', name: 'USD', display: 'US Dollar', enumSynonyms }]
    }
  });
  return <FormProvider {...form}>{children}</FormProvider>;
}

function renderSynonymRow(opts: {
  nodeId?: string;
  enumSynonyms?: unknown[];
  synonymSourceOptions?: SourceRefOption[];
  addEnumValueSynonym?: ReturnType<typeof vi.fn>;
  removeEnumValueSynonym?: ReturnType<typeof vi.fn>;
} = {}) {
  const {
    nodeId = 'ns.Color',
    enumSynonyms = [],
    synonymSourceOptions = SAME_NS_OPTIONS,
    addEnumValueSynonym = vi.fn(),
    removeEnumValueSynonym = vi.fn()
  } = opts;

  const mockActions = { addEnumValueSynonym, removeEnumValueSynonym } as any;

  return {
    ...render(
      <SynonymWrapper enumSynonyms={enumSynonyms}>
        <EditorActionsProvider nodeId={nodeId} actions={mockActions}>
          <EnumValueRow
            name="USD"
            displayName="US Dollar"
            nodeId={nodeId}
            index={0}
            onUpdate={vi.fn()}
            onRemove={vi.fn()}
            onReorder={vi.fn()}
            synonymSourceOptions={synonymSourceOptions}
          />
        </EditorActionsProvider>
      </SynonymWrapper>
    ),
    addEnumValueSynonym,
    removeEnumValueSynonym
  };
}

/** Drive the SourceRefField picker (Radix Popover works in jsdom). */
function pickSourceInSynonymRow(label: string) {
  const trigger = document.querySelector('[data-slot="source-ref-trigger"]');
  expect(trigger).not.toBeNull();
  fireEvent.click(trigger!);
  fireEvent.click(screen.getByText(label));
}

describe('EnumValueRow — synonym control (Task 6)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── plan L15 — same-namespace: local source stays bare ───────────────────

  it('same-namespace: addEnumValueSynonym fires with bare refText', () => {
    const addEnumValueSynonym = vi.fn();
    renderSynonymRow({
      nodeId: 'ns.Color',
      synonymSourceOptions: SAME_NS_OPTIONS,
      addEnumValueSynonym
    });

    pickSourceInSynonymRow('FIX');

    const valueInput = document.querySelector<HTMLInputElement>('[data-slot="enum-synonym-value-input"]')!;
    fireEvent.change(valueInput, { target: { value: 'TD' } });

    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    // host 'ns.Color' and source 'ns.FIX' share namespace 'ns' → bare 'FIX'
    expect(addEnumValueSynonym).toHaveBeenCalledWith('ns.Color', 0, 'FIX', 'TD');
  });

  // ── plan L15 — cross-namespace: source qualifies ─────────────────────────

  it('cross-namespace: addEnumValueSynonym fires with qualified refText', () => {
    const addEnumValueSynonym = vi.fn();
    renderSynonymRow({
      nodeId: 'ns.Color',
      synonymSourceOptions: CROSS_NS_OPTIONS,
      addEnumValueSynonym
    });

    pickSourceInSynonymRow('FpML');

    const valueInput = document.querySelector<HTMLInputElement>('[data-slot="enum-synonym-value-input"]')!;
    fireEvent.change(valueInput, { target: { value: 'TD' } });

    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    // host 'ns.Color' and source 'other.FpML' differ → qualified 'other.FpML'
    expect(addEnumValueSynonym).toHaveBeenCalledWith('ns.Color', 0, 'other.FpML', 'TD');
  });

  // ── chip rendering ────────────────────────────────────────────────────────

  it('existing synonym chip renders source $refText and synonymValue', () => {
    renderSynonymRow({
      enumSynonyms: [{ sources: [{ $refText: 'FIX' }], synonymValue: 'TD' }]
    });

    // Chip label is "FIX — TD"; both parts must be visible
    expect(screen.getByText(/FIX/)).toBeInTheDocument();
    expect(screen.getByText(/TD/)).toBeInTheDocument();
  });

  // ── remove ────────────────────────────────────────────────────────────────

  it('chip remove button calls removeEnumValueSynonym(nodeId, index, synIndex)', () => {
    const removeEnumValueSynonym = vi.fn();
    renderSynonymRow({
      nodeId: 'ns.Color',
      enumSynonyms: [{ sources: [{ $refText: 'FIX' }], synonymValue: 'TD' }],
      removeEnumValueSynonym
    });

    const removeBtn = screen.getByLabelText(/remove enum synonym FIX/i);
    fireEvent.click(removeBtn);

    expect(removeEnumValueSynonym).toHaveBeenCalledWith('ns.Color', 0, 0);
  });
});
