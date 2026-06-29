// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for the host-aware synonym source control in MetadataSection (Task 5).
 *
 * Covers:
 * - Source trigger is reachable from the rendered section (Task 3 note)
 * - Data host: pick source → addSynonym(nodeId, label) fires, chip appears
 * - Data host with value: pick source + type value → addSynonym(nodeId, label, value) fires
 * - Enum host: value Input is visible; addSynonym(nodeId, label, value) fires
 * - Remove chip calls removeSynonym(index)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import type { ReactNode } from 'react';
import { MetadataSection } from '../../src/components/editors/MetadataSection.js';
import type { SourceRefOption } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Fixture options
// ---------------------------------------------------------------------------

const OPTIONS: SourceRefOption[] = [{ value: 'ns.FpML', label: 'FpML', namespace: 'ns' }];

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
}) {
  const {
    $type = 'Data',
    synonyms = [],
    onSynonymAdd = vi.fn(),
    onSynonymRemove = vi.fn(),
    synonymSourceOptions = OPTIONS
  } = opts;

  const utils = render(
    <Wrapper $type={$type} synonyms={synonyms}>
      <MetadataSection
        synonymSourceOptions={synonymSourceOptions}
        onSynonymAdd={onSynonymAdd}
        onSynonymRemove={onSynonymRemove}
      />
    </Wrapper>
  );
  return { ...utils, onSynonymAdd, onSynonymRemove };
}

// ---------------------------------------------------------------------------
// Helpers — drive the SourceRefField picker (Radix Popover works in jsdom)
// ---------------------------------------------------------------------------

function pickSource(label: string) {
  // Open the picker by clicking the trigger
  const trigger = document.querySelector('[data-slot="source-ref-trigger"]');
  expect(trigger).not.toBeNull();
  fireEvent.click(trigger!);
  // Click the option
  fireEvent.click(screen.getByText(label));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MetadataSection — synonym source control', () => {
  beforeEach(() => {
    // No fake timers needed — synonym add is immediate (no debounce)
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('source trigger is reachable from the rendered section (Task 3 smoke)', () => {
    renderSection({});
    const trigger = document.querySelector('[data-slot="source-ref-trigger"]');
    expect(trigger).toBeInTheDocument();
  });

  it('Data host: picking a source and clicking Add fires addSynonym(source)', () => {
    const onSynonymAdd = vi.fn();
    renderSection({ $type: 'Data', onSynonymAdd });

    pickSource('FpML');

    const addBtn = screen.getByRole('button', { name: /^add$/i });
    fireEvent.click(addBtn);

    expect(onSynonymAdd).toHaveBeenCalledWith('FpML', undefined);
  });

  it('Data host: synonym chip appears after adding', () => {
    renderSection({ $type: 'Data' });

    pickSource('FpML');
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    expect(screen.getByText('FpML')).toBeInTheDocument();
  });

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

  it('Enum host: addSynonym(source, value) fires with both args', () => {
    const onSynonymAdd = vi.fn();
    renderSection({ $type: 'RosettaEnumeration', onSynonymAdd });

    pickSource('FpML');

    const valueInput = document.querySelector<HTMLInputElement>('[data-slot="synonym-value-input"]')!;
    fireEvent.change(valueInput, { target: { value: 'TD' } });

    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    expect(onSynonymAdd).toHaveBeenCalledWith('FpML', 'TD');
  });

  it('Add button is disabled when no source is selected', () => {
    renderSection({});
    const addBtn = screen.getByRole('button', { name: /^add$/i });
    expect(addBtn).toBeDisabled();
  });

  it('existing synonym chips render the source $refText', () => {
    renderSection({
      synonyms: [{ sources: [{ $refText: 'FpML' }] }]
    });
    expect(screen.getByText('FpML')).toBeInTheDocument();
  });

  it('existing synonym chips show value name when present', () => {
    renderSection({
      synonyms: [{ sources: [{ $refText: 'FIX' }], value: { name: 'TradeDate' } }]
    });
    // Chip shows "FIX — TradeDate"
    expect(screen.getByText(/FIX/)).toBeInTheDocument();
    expect(screen.getByText(/TradeDate/)).toBeInTheDocument();
  });

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
