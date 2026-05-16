// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for the VisualPreviewPanel Radix Tabs shell (Phase 7, Task 7.3).
 *
 * Verifies:
 * - Both tab triggers (Graph / Structure) are rendered.
 * - The Graph tab content is visible by default.
 * - The Structure tab content pane is present in the DOM.
 *
 * PR #182 round-2 regression tests (Findings 1 & 2):
 * - Finding 1 (CRITICAL): ChoiceOption AST nodes have only `typeCall` — no
 *   `name`, no `card`. The projection now uses the new `choiceOptions` field
 *   on AdapterNode instead of synthesizing fake AdapterAttribute entries.
 *   Test verifies no throw and correct focusedTypeId forwarding.
 * - Finding 2 (MED): Selecting a non-Data/Choice/Enum node (Function, RecordType,
 *   etc.) should NOT forward a focusedTypeId to StructureView (the old code
 *   forwarded it, causing a misleading "stale selection" message). Test verifies
 *   StructureView receives `undefined` → empty-selection state.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEditorStore } from '@rune-langium/visual-editor';
import { act } from '@testing-library/react';

// Mock StructureView to avoid ReactFlow + geometry issues in jsdom.
// The mock exposes focusedTypeId via a data attribute so assertions can
// inspect it without drilling into internal state.
vi.mock('@rune-langium/visual-editor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rune-langium/visual-editor')>();
  return {
    ...actual,
    StructureView: ({ focusedTypeId }: { focusedTypeId?: string }) => (
      <div data-testid="mock-structure-view" data-focused-type-id={focusedTypeId ?? ''}>
        {focusedTypeId
          ? `Structure: ${focusedTypeId}`
          : 'Select a type from the Namespace Explorer to view its structure.'}
      </div>
    )
  };
});

// Import after mocking
import { VisualPreviewPanel } from '../../../src/shell/panels/VisualPreviewPanel.js';

describe('VisualPreviewPanel — Radix Tabs shell', () => {
  beforeEach(() => {
    // Reset editor store: clear nodes and selection between tests so state
    // from one test doesn't bleed into the next.
    act(() => {
      useEditorStore.getState().selectNode(null);
      // Replace nodes array directly via setState (zustand's vanilla API)
      useEditorStore.setState({ nodes: [] });
    });
  });

  it('renders the panel container with correct testid', () => {
    render(<VisualPreviewPanel />);
    expect(screen.getByTestId('panel-visualPreview')).toBeInTheDocument();
  });

  it('renders both tab triggers: Graph and Structure', () => {
    render(<VisualPreviewPanel />);
    expect(screen.getByRole('tab', { name: 'Graph' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Structure' })).toBeInTheDocument();
  });

  it('shows Graph tab content by default (children fallback)', () => {
    render(<VisualPreviewPanel />);
    expect(screen.getByText('The graph-focused modeling view mounts here.')).toBeInTheDocument();
  });

  it('shows custom children in Graph tab', () => {
    render(
      <VisualPreviewPanel>
        <div data-testid="custom-graph">My Graph</div>
      </VisualPreviewPanel>
    );
    expect(screen.getByTestId('custom-graph')).toBeInTheDocument();
  });

  it('renders the Structure tab pane with StructureView', async () => {
    const user = userEvent.setup();
    render(<VisualPreviewPanel />);

    const structureTab = screen.getByRole('tab', { name: 'Structure' });
    await user.click(structureTab);

    expect(screen.getByTestId('mock-structure-view')).toBeInTheDocument();
  });

  it('TabsList has aria-label "View mode"', () => {
    render(<VisualPreviewPanel />);
    expect(screen.getByRole('tablist', { name: 'View mode' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Finding 1 regression: Choice node projection uses real ChoiceOption shape
// ---------------------------------------------------------------------------

describe('VisualPreviewPanel — Finding 1: Choice projection uses real ChoiceOption shape', () => {
  beforeEach(() => {
    act(() => {
      useEditorStore.getState().selectNode(null);
      useEditorStore.setState({ nodes: [] });
    });
  });

  it('does not throw when projecting a Choice node whose options have no name/card', async () => {
    // Inject a minimal Choice node that mirrors the real ChoiceOption AST shape:
    // { $type, typeCall, … } — NO `name`, NO `card`.
    // Pre-fix this crashed inside buildRow when it dereferenced attr.card.inf.
    // The architectural fix maps these to choiceOptions, never to attributes.
    const choiceNodeId = 'cdm.payment::SettlementMethod';
    act(() => {
      useEditorStore.setState({
        nodes: [
          {
            id: choiceNodeId,
            type: 'choice',
            position: { x: 0, y: 0 },
            data: {
              $type: 'Choice',
              name: 'SettlementMethod',
              namespace: 'cdm.payment',
              // Real ChoiceOption shape: only typeCall, no name/card
              attributes: [
                { $type: 'ChoiceOption', typeCall: { type: { $refText: 'CashSettlement' } } },
                { $type: 'ChoiceOption', typeCall: { type: { $refText: 'PhysicalSettlement' } } }
              ]
            } as any
          }
        ]
      });
      useEditorStore.getState().selectNode(choiceNodeId);
    });

    // Should not throw — previously crashed during adapterDocument projection
    expect(() => render(<VisualPreviewPanel />)).not.toThrow();
  });

  it('forwards focusedTypeId correctly for a selected Choice node', () => {
    const choiceNodeId = 'cdm.payment::SettlementMethod';
    act(() => {
      useEditorStore.setState({
        nodes: [
          {
            id: choiceNodeId,
            type: 'choice',
            position: { x: 0, y: 0 },
            data: {
              $type: 'Choice',
              name: 'SettlementMethod',
              namespace: 'cdm.payment',
              attributes: [{ $type: 'ChoiceOption', typeCall: { type: { $refText: 'CashSettlement' } } }]
            } as any
          }
        ]
      });
      useEditorStore.getState().selectNode(choiceNodeId);
    });

    render(<VisualPreviewPanel />);
    const sv = screen.getByTestId('mock-structure-view');
    expect(sv.getAttribute('data-focused-type-id')).toBe(choiceNodeId);
  });

  it('renders the structure view (not empty state) for a selected Choice node', () => {
    const choiceNodeId = 'cdm.payment::SettlementMethod';
    act(() => {
      useEditorStore.setState({
        nodes: [
          {
            id: choiceNodeId,
            type: 'choice',
            position: { x: 0, y: 0 },
            data: {
              $type: 'Choice',
              name: 'SettlementMethod',
              namespace: 'cdm.payment',
              attributes: [{ $type: 'ChoiceOption', typeCall: { type: { $refText: 'CashSettlement' } } }]
            } as any
          }
        ]
      });
      useEditorStore.getState().selectNode(choiceNodeId);
    });

    // The mock StructureView renders `Structure: <id>` when focusedTypeId is defined.
    render(<VisualPreviewPanel />);
    expect(screen.getByText(`Structure: ${choiceNodeId}`)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Finding 2 regression: unsupported node kinds show empty state, not stale msg
// ---------------------------------------------------------------------------

describe('VisualPreviewPanel — Finding 2: unsupported node kind yields empty state', () => {
  beforeEach(() => {
    act(() => {
      useEditorStore.getState().selectNode(null);
      useEditorStore.setState({ nodes: [] });
    });
  });

  it('forwards undefined focusedTypeId when a Function node is selected', () => {
    const funcNodeId = 'cdm.event::Create';
    act(() => {
      useEditorStore.setState({
        nodes: [
          {
            id: funcNodeId,
            type: 'func',
            position: { x: 0, y: 0 },
            data: {
              $type: 'RosettaFunction',
              name: 'Create',
              namespace: 'cdm.event',
              inputs: [],
              conditions: []
            } as any
          }
        ]
      });
      useEditorStore.getState().selectNode(funcNodeId);
    });

    render(<VisualPreviewPanel />);
    const sv = screen.getByTestId('mock-structure-view');
    // focusedTypeId should be undefined → empty string attribute → empty state
    expect(sv.getAttribute('data-focused-type-id')).toBe('');
    expect(screen.getByText('Select a type from the Namespace Explorer to view its structure.')).toBeInTheDocument();
  });

  it('forwards undefined focusedTypeId when a RecordType node is selected', () => {
    const recordNodeId = 'cdm.base::Date';
    act(() => {
      useEditorStore.setState({
        nodes: [
          {
            id: recordNodeId,
            type: 'record',
            position: { x: 0, y: 0 },
            data: {
              $type: 'RosettaRecordType',
              name: 'Date',
              namespace: 'cdm.base',
              features: []
            } as any
          }
        ]
      });
      useEditorStore.getState().selectNode(recordNodeId);
    });

    render(<VisualPreviewPanel />);
    const sv = screen.getByTestId('mock-structure-view');
    expect(sv.getAttribute('data-focused-type-id')).toBe('');
  });

  it('forwards focusedTypeId correctly when a Data node is selected (supported kind)', () => {
    const dataNodeId = 'cdm.event::TradeState';
    act(() => {
      useEditorStore.setState({
        nodes: [
          {
            id: dataNodeId,
            type: 'data',
            position: { x: 0, y: 0 },
            data: {
              $type: 'Data',
              name: 'TradeState',
              namespace: 'cdm.event',
              attributes: []
            } as any
          }
        ]
      });
      useEditorStore.getState().selectNode(dataNodeId);
    });

    render(<VisualPreviewPanel />);
    const sv = screen.getByTestId('mock-structure-view');
    expect(sv.getAttribute('data-focused-type-id')).toBe(dataNodeId);
  });
});
