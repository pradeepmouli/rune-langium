// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for the three display affordances (spec 020 §3.3/§3.4/§8):
 *
 *   1. Enum row glyph (↗) — appears on rows with typeKind === 'Enum', fires
 *      onNavigateToEnumType with the row's targetNodeId on click.
 *
 *   2. Unresolved-ref glyph (?) — appears on rows with typeKind === 'Unresolved';
 *      shows a tooltip with the LSP error or a fallback message.
 *
 *   3. Diagnostic left-edge marker — applies severity CSS class to rows whose
 *      astRange overlaps a passed-in RangeDiagnostic.
 *
 * All tests use fixture-based StructureRow data (no real LSP / React Flow).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { DataNode } from '../../../src/components/nodes/DataNode.js';
import type { StructureRow } from '../../../src/types/structure-view.js';
import type { RangeDiagnostic } from '../../../src/hooks/useDiagnosticsForRange.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderInFlow(jsx: React.ReactNode) {
  return render(<ReactFlowProvider>{jsx}</ReactFlowProvider>);
}

/** Minimal StructureRow fixture builder. */
function makeRow(overrides: Partial<StructureRow> & { typeKind: StructureRow['typeKind'] }): StructureRow {
  return {
    attrName: 'field',
    typeName: 'SomeType',
    cardinality: '1',
    isOptional: false,
    isInherited: false,
    ...overrides
  };
}

/** Minimal structure-variant DataNode data payload builder. */
function makeData(rows: StructureRow[], extras: Record<string, unknown> = {}): unknown {
  return {
    $type: 'Data',
    id: 'test.ns::Trade',
    kind: 'data',
    name: 'Trade',
    namespaceUri: 'test.ns',
    rows,
    expansions: new Map(),
    variant: 'structure',
    ...extras
  };
}

// ---------------------------------------------------------------------------
// Affordance 1: Enum row glyph (↗)
// ---------------------------------------------------------------------------

describe('DataNode affordances — enum nav glyph (↗)', () => {
  const enumRow = makeRow({
    attrName: 'status',
    typeName: 'TradeStatus',
    typeKind: 'Enum',
    targetNodeId: 'test.ns::TradeStatus'
  });

  it('renders the ↗ button for an Enum row when onNavigateToEnumType is provided', () => {
    const onNav = vi.fn();
    renderInFlow(
      <DataNode
        data={makeData([enumRow], { onNavigateToEnumType: onNav }) as any}
        selected={false}
        id="n1"
        type="data"
      />
    );
    expect(screen.getByTestId('enum-nav-status')).toBeInTheDocument();
  });

  it('does NOT render the ↗ button when onNavigateToEnumType is absent', () => {
    renderInFlow(<DataNode data={makeData([enumRow]) as any} selected={false} id="n1" type="data" />);
    expect(screen.queryByTestId('enum-nav-status')).toBeNull();
  });

  it('does NOT render the ↗ button for a Enum row missing targetNodeId', () => {
    const noTargetRow = makeRow({ attrName: 'status', typeName: 'TradeStatus', typeKind: 'Enum' });
    const onNav = vi.fn();
    renderInFlow(
      <DataNode
        data={makeData([noTargetRow], { onNavigateToEnumType: onNav }) as any}
        selected={false}
        id="n1"
        type="data"
      />
    );
    expect(screen.queryByTestId('enum-nav-status')).toBeNull();
  });

  it('fires onNavigateToEnumType with targetNodeId on click', () => {
    const onNav = vi.fn();
    renderInFlow(
      <DataNode
        data={makeData([enumRow], { onNavigateToEnumType: onNav }) as any}
        selected={false}
        id="n1"
        type="data"
      />
    );
    fireEvent.click(screen.getByTestId('enum-nav-status'));
    expect(onNav).toHaveBeenCalledOnce();
    expect(onNav).toHaveBeenCalledWith('test.ns::TradeStatus');
  });

  it('renders as a <button> element for keyboard accessibility', () => {
    const onNav = vi.fn();
    renderInFlow(
      <DataNode
        data={makeData([enumRow], { onNavigateToEnumType: onNav }) as any}
        selected={false}
        id="n1"
        type="data"
      />
    );
    const btn = screen.getByTestId('enum-nav-status');
    expect(btn.tagName).toBe('BUTTON');
  });

  it('has an aria-label including the type name', () => {
    const onNav = vi.fn();
    renderInFlow(
      <DataNode
        data={makeData([enumRow], { onNavigateToEnumType: onNav }) as any}
        selected={false}
        id="n1"
        type="data"
      />
    );
    const btn = screen.getByTestId('enum-nav-status');
    expect(btn.getAttribute('aria-label')).toContain('TradeStatus');
  });

  it('does NOT render ↗ for non-Enum rows even when callback is provided', () => {
    const dataRow = makeRow({ attrName: 'economics', typeName: 'Economics', typeKind: 'Data' });
    const onNav = vi.fn();
    renderInFlow(
      <DataNode
        data={makeData([dataRow], { onNavigateToEnumType: onNav }) as any}
        selected={false}
        id="n1"
        type="data"
      />
    );
    expect(screen.queryByTestId('enum-nav-economics')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Affordance 2: Unresolved-ref glyph (?)
// ---------------------------------------------------------------------------

describe('DataNode affordances — unresolved-ref glyph (?)', () => {
  const unresolvedRow = makeRow({
    attrName: 'counterparty',
    typeName: 'LegalEntity',
    typeKind: 'Unresolved'
  });

  it('renders the ? glyph for an Unresolved row', () => {
    renderInFlow(<DataNode data={makeData([unresolvedRow]) as any} selected={false} id="n1" type="data" />);
    expect(screen.getByTestId('unresolved-counterparty')).toBeInTheDocument();
  });

  it('does NOT render the ? glyph for non-Unresolved rows', () => {
    const dataRow = makeRow({ attrName: 'economics', typeName: 'Economics', typeKind: 'Data' });
    renderInFlow(<DataNode data={makeData([dataRow]) as any} selected={false} id="n1" type="data" />);
    expect(screen.queryByTestId('unresolved-economics')).toBeNull();
  });

  it('shows the fallback title when no diagnostic overlaps', () => {
    renderInFlow(<DataNode data={makeData([unresolvedRow]) as any} selected={false} id="n1" type="data" />);
    const glyph = screen.getByTestId('unresolved-counterparty');
    expect(glyph.getAttribute('title')).toContain('LegalEntity');
    expect(glyph.getAttribute('title')).toContain('not found');
  });

  it('shows LSP diagnostic message as title when an overlapping diagnostic is provided', () => {
    const lspMsg = 'Could not resolve reference to LegalEntity';
    const diag: RangeDiagnostic = { start: 0, end: 100, severity: 1, message: lspMsg };
    const rowWithRange = makeRow({
      attrName: 'counterparty',
      typeName: 'LegalEntity',
      typeKind: 'Unresolved',
      astRange: { start: 10, end: 50 }
    });
    renderInFlow(
      <DataNode
        data={makeData([rowWithRange], { structureDiagnostics: [diag] }) as any}
        selected={false}
        id="n1"
        type="data"
      />
    );
    const glyph = screen.getByTestId('unresolved-counterparty');
    expect(glyph.getAttribute('title')).toBe(lspMsg);
  });
});

// ---------------------------------------------------------------------------
// Affordance 3: Diagnostic left-edge severity marker
// ---------------------------------------------------------------------------

describe('DataNode affordances — diagnostic left-edge marker', () => {
  const rowWithRange = makeRow({
    attrName: 'field',
    typeName: 'SomeType',
    typeKind: 'BasicType',
    astRange: { start: 10, end: 30 }
  });

  const rowNoRange = makeRow({
    attrName: 'field2',
    typeName: 'OtherType',
    typeKind: 'BasicType'
  });

  it('applies --diagnostic-error class when severity-1 diagnostic overlaps astRange', () => {
    const diag: RangeDiagnostic = { start: 5, end: 35, severity: 1, message: 'error' };
    renderInFlow(
      <DataNode
        data={makeData([rowWithRange], { structureDiagnostics: [diag] }) as any}
        selected={false}
        id="n1"
        type="data"
      />
    );
    const row = document.querySelector('[data-attr="field"]');
    expect(row?.className).toContain('rune-node-row--diagnostic-error');
  });

  it('applies --diagnostic-warn class for severity-2', () => {
    const diag: RangeDiagnostic = { start: 5, end: 35, severity: 2, message: 'warn' };
    renderInFlow(
      <DataNode
        data={makeData([rowWithRange], { structureDiagnostics: [diag] }) as any}
        selected={false}
        id="n1"
        type="data"
      />
    );
    const row = document.querySelector('[data-attr="field"]');
    expect(row?.className).toContain('rune-node-row--diagnostic-warn');
  });

  it('applies --diagnostic-info class for severity-3', () => {
    const diag: RangeDiagnostic = { start: 5, end: 35, severity: 3, message: 'info' };
    renderInFlow(
      <DataNode
        data={makeData([rowWithRange], { structureDiagnostics: [diag] }) as any}
        selected={false}
        id="n1"
        type="data"
      />
    );
    const row = document.querySelector('[data-attr="field"]');
    expect(row?.className).toContain('rune-node-row--diagnostic-info');
  });

  it('applies --diagnostic-info class for severity-4 (hint)', () => {
    const diag: RangeDiagnostic = { start: 5, end: 35, severity: 4, message: 'hint' };
    renderInFlow(
      <DataNode
        data={makeData([rowWithRange], { structureDiagnostics: [diag] }) as any}
        selected={false}
        id="n1"
        type="data"
      />
    );
    const row = document.querySelector('[data-attr="field"]');
    expect(row?.className).toContain('rune-node-row--diagnostic-info');
  });

  it('does NOT apply diagnostic class when no diagnostic overlaps the astRange', () => {
    const diag: RangeDiagnostic = { start: 100, end: 200, severity: 1, message: 'far away' };
    renderInFlow(
      <DataNode
        data={makeData([rowWithRange], { structureDiagnostics: [diag] }) as any}
        selected={false}
        id="n1"
        type="data"
      />
    );
    const row = document.querySelector('[data-attr="field"]');
    expect(row?.className).not.toContain('rune-node-row--diagnostic-');
  });

  it('does NOT apply diagnostic class when row has no astRange', () => {
    const diag: RangeDiagnostic = { start: 5, end: 35, severity: 1, message: 'error' };
    renderInFlow(
      <DataNode
        data={makeData([rowNoRange], { structureDiagnostics: [diag] }) as any}
        selected={false}
        id="n1"
        type="data"
      />
    );
    const row = document.querySelector('[data-attr="field2"]');
    expect(row?.className).not.toContain('rune-node-row--diagnostic-');
  });

  it('does NOT apply diagnostic class when structureDiagnostics is absent', () => {
    renderInFlow(<DataNode data={makeData([rowWithRange]) as any} selected={false} id="n1" type="data" />);
    const row = document.querySelector('[data-attr="field"]');
    expect(row?.className).not.toContain('rune-node-row--diagnostic-');
  });

  it('picks highest-severity when multiple diagnostics overlap the same row', () => {
    const warn: RangeDiagnostic = { start: 5, end: 35, severity: 2, message: 'warn' };
    const error: RangeDiagnostic = { start: 15, end: 25, severity: 1, message: 'error' };
    renderInFlow(
      <DataNode
        data={makeData([rowWithRange], { structureDiagnostics: [warn, error] }) as any}
        selected={false}
        id="n1"
        type="data"
      />
    );
    const row = document.querySelector('[data-attr="field"]');
    expect(row?.className).toContain('rune-node-row--diagnostic-error');
    expect(row?.className).not.toContain('rune-node-row--diagnostic-warn');
  });
});
