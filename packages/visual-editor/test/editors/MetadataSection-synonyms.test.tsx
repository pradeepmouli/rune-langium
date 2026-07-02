// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for the host-aware synonym source control in MetadataSection (Task 5).
 *
 * Covers:
 * - Source trigger is reachable from the rendered section (Task 3 note)
 * - Same-namespace: picked source stays bare (plan L15, local-stays-bare half)
 * - Cross-namespace: picked source qualifies as `${ns}.${name}` (plan L15, cross-ns half)
 * - Enum host: value Input appears; addSynonym fires with (source, value)
 * - Chip rendering: existing synonyms read AST {sources,value} objects
 * - Remove chip calls removeSynonym(index)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import type { ReactNode } from 'react';
import { MetadataSection } from '../../src/components/editors/MetadataSection.js';
import { EditorActionsProvider } from '../../src/components/forms/sections/EditorActionsContext.js';
import type { SourceRefOption } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Fixture options
// ---------------------------------------------------------------------------

// Default option list — source lives in namespace 'ns'
const OPTIONS: SourceRefOption[] = [{ value: 'ns.FpML', label: 'FpML', namespace: 'ns' }];

// Cross-namespace option — source lives in namespace 'other'
const CROSS_NS_OPTIONS: SourceRefOption[] = [{ value: 'other.FIX', label: 'FIX', namespace: 'other' }];

// Minimal EditorFormActions stub — only properties used by MetadataSection
const MINIMAL_ACTIONS = {
  addSynonym: vi.fn(),
  removeSynonym: vi.fn(),
  updateDefinition: vi.fn(),
  updateComments: vi.fn()
} as any;

// ---------------------------------------------------------------------------
// Test wrapper — provides RHF FormProvider with a given $type and synonyms
// ---------------------------------------------------------------------------

function Wrapper({
  $type = 'Data',
  synonyms = [],
  children
}: {
  $type?: string;
  synonyms?: unknown[];
  children: ReactNode;
}) {
  const form = useForm({
    defaultValues: { $type, definition: '', comments: '', synonyms }
  });
  return <FormProvider {...form}>{children}</FormProvider>;
}

function renderSection(opts: {
  $type?: string;
  synonyms?: unknown[];
  onSynonymAdd?: (source: string, value?: string) => void;
  onSynonymRemove?: (index: number) => void;
  synonymSourceOptions?: SourceRefOption[];
  /** When provided, wraps MetadataSection with EditorActionsProvider so
   *  ctx.nodeId is available for same-/cross-namespace resolution. */
  nodeId?: string;
}) {
  const {
    $type = 'Data',
    synonyms = [],
    onSynonymAdd = vi.fn(),
    onSynonymRemove = vi.fn(),
    synonymSourceOptions = OPTIONS,
    nodeId
  } = opts;

  const section = (
    <MetadataSection
      synonymSourceOptions={synonymSourceOptions}
      onSynonymAdd={onSynonymAdd}
      onSynonymRemove={onSynonymRemove}
    />
  );

  // Wrap with EditorActionsProvider when nodeId is supplied so that
  // handleAddSynonym can resolve ctx.nodeId → hostNs for namespace comparison.
  const inner = nodeId ? (
    <EditorActionsProvider nodeId={nodeId} actions={MINIMAL_ACTIONS}>
      {section}
    </EditorActionsProvider>
  ) : (
    section
  );

  const utils = render(
    <Wrapper $type={$type} synonyms={synonyms}>
      {inner}
    </Wrapper>
  );
  return { ...utils, onSynonymAdd, onSynonymRemove };
}

// ---------------------------------------------------------------------------
// Helpers — drive the SourceRefField picker (Radix Popover works in jsdom)
// ---------------------------------------------------------------------------

function pickSource(label: string) {
  const trigger = document.querySelector('[data-slot="source-ref-trigger"]');
  expect(trigger).not.toBeNull();
  fireEvent.click(trigger!);
  fireEvent.click(screen.getByText(label));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MetadataSection — synonym source control', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('source trigger is reachable from the rendered section (Task 3 smoke)', () => {
    renderSection({});
    const trigger = document.querySelector('[data-slot="source-ref-trigger"]');
    expect(trigger).toBeInTheDocument();
  });

  // ── plan L15 — same-namespace: local source stays bare ──────────────────

  it('same-namespace source: addSynonym fired with bare label (plan L15 local half)', () => {
    // host in namespace 'ns', source also in 'ns' → refText = 'FpML' (bare)
    const onSynonymAdd = vi.fn();
    renderSection({ $type: 'Data', onSynonymAdd, nodeId: 'ns.Trade' });

    pickSource('FpML');
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    expect(onSynonymAdd).toHaveBeenCalledWith('FpML', undefined);
  });

  // ── plan L15 — cross-namespace: source qualifies ────────────────────────

  it('cross-namespace source: addSynonym fired with qualified $refText (plan L15 cross-ns half)', () => {
    // host in namespace 'ns', source in namespace 'other' → refText = 'other.FIX'
    const onSynonymAdd = vi.fn();
    renderSection({
      $type: 'Data',
      onSynonymAdd,
      nodeId: 'ns.Trade',
      synonymSourceOptions: CROSS_NS_OPTIONS
    });

    pickSource('FIX');
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    expect(onSynonymAdd).toHaveBeenCalledWith('other.FIX', undefined);
  });

  // ── chip appearance ──────────────────────────────────────────────────────

  it('synonym chip appears after adding (same-namespace)', () => {
    renderSection({ $type: 'Data', nodeId: 'ns.Trade' });

    pickSource('FpML');
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    expect(screen.getByText('FpML')).toBeInTheDocument();
  });

  // ── enum host ────────────────────────────────────────────────────────────

  it('Data host: value Input is NOT visible for non-enum hosts', () => {
    renderSection({ $type: 'Data' });
    const valueInput = document.querySelector('[data-slot="synonym-value-input"]');
    expect(valueInput).toBeNull();
  });

  it('Enum host: value Input is visible', () => {
    renderSection({ $type: 'RosettaEnumeration' });
    const valueInput = document.querySelector('[data-slot="synonym-value-input"]');
    expect(valueInput).toBeInTheDocument();
  });

  it('Enum host: addSynonym(source, value) fires with both args (same-namespace)', () => {
    // host in 'ns', source in 'ns' → refText = 'FpML' bare; value = 'TD'
    const onSynonymAdd = vi.fn();
    renderSection({ $type: 'RosettaEnumeration', onSynonymAdd, nodeId: 'ns.Rates' });

    pickSource('FpML');

    const valueInput = document.querySelector<HTMLInputElement>('[data-slot="synonym-value-input"]')!;
    fireEvent.change(valueInput, { target: { value: 'TD' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    expect(onSynonymAdd).toHaveBeenCalledWith('FpML', 'TD');
  });

  // ── disabled state ───────────────────────────────────────────────────────

  it('Add button is disabled when no source is selected', () => {
    renderSection({});
    const addBtn = screen.getByRole('button', { name: /^add$/i });
    expect(addBtn).toBeDisabled();
  });

  it('Enum host: Add button stays disabled when source selected but value is blank', () => {
    // Verifies the phantom-chip guard: store no-ops value-less enum synonyms,
    // so the UI must require both source AND value before enabling Add.
    const onSynonymAdd = vi.fn();
    renderSection({ $type: 'RosettaEnumeration', onSynonymAdd, nodeId: 'ns.Rates' });

    // Pick source but leave value empty → Add must remain disabled
    pickSource('FpML');
    const addBtn = screen.getByRole('button', { name: /^add$/i });
    expect(addBtn).toBeDisabled();

    // Store must NOT be called (no phantom chip)
    expect(onSynonymAdd).not.toHaveBeenCalled();
  });

  // ── existing chip rendering ──────────────────────────────────────────────

  it('existing synonym chips render the source $refText', () => {
    renderSection({
      synonyms: [{ sources: [{ $refText: 'FpML' }] }]
    });
    expect(screen.getByText('FpML')).toBeInTheDocument();
  });

  it('existing synonym chips show value name when present (class shape)', () => {
    renderSection({
      synonyms: [{ sources: [{ $refText: 'FIX' }], value: { name: 'TradeDate' } }]
    });
    // Chip label is "FIX — TradeDate"
    expect(screen.getByText(/FIX/)).toBeInTheDocument();
    expect(screen.getByText(/TradeDate/)).toBeInTheDocument();
  });

  it('existing enum-host synonym chips show value from body.values (RosettaSynonym shape)', () => {
    // After reload the store sends body.values (not value.name) for enum-host synonyms.
    renderSection({
      $type: 'RosettaEnumeration',
      synonyms: [
        { $type: 'RosettaSynonym', sources: [{ $refText: 'FpML' }], body: { values: [{ name: 'tradeDate' }] } }
      ]
    });
    // Chip must show "FpML — tradeDate" by reading body.values[0].name.
    expect(screen.getByText('FpML — tradeDate')).toBeInTheDocument();
  });

  it('Enum host: optimistic chip after add shows source — value from body.values shape', () => {
    // After add, the optimistic entry must use body.values (RosettaSynonym) not value.name
    // (RosettaClassSynonym) so the chip label and form state match the store's representation.
    renderSection({ $type: 'RosettaEnumeration', nodeId: 'ns.Rates' });

    pickSource('FpML');
    const valueInput = document.querySelector<HTMLInputElement>('[data-slot="synonym-value-input"]')!;
    fireEvent.change(valueInput, { target: { value: 'TD' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    // Chip label "FpML — TD" requires body.values[0].name to be set on the entry.
    expect(screen.getByText('FpML — TD')).toBeInTheDocument();
  });

  // ── remove ───────────────────────────────────────────────────────────────

  it('clicking chip × calls removeSynonym(index)', () => {
    const onSynonymRemove = vi.fn();
    renderSection({
      synonyms: [{ sources: [{ $refText: 'FpML' }] }, { sources: [{ $refText: 'FIX' }] }],
      onSynonymRemove
    });

    const removeButtons = screen.getAllByRole('button', { name: /remove synonym/i });
    fireEvent.click(removeButtons[0]);

    expect(onSynonymRemove).toHaveBeenCalledWith(0);
  });
});
