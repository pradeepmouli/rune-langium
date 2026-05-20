// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Integration tests for EditorFormPanel (T048).
 *
 * Covers:
 * - Dispatch by kind (data -> DataTypeForm, readOnly -> DetailPanel, null -> empty)
 * - Accessibility attributes (role, aria-label)
 * - Escape key closes panel
 * - Sticky header renders name + kind badge
 * - Inspector close remains keyboard-driven (Escape), no header close button
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { parse } from '@rune-langium/core';
import { EditorFormPanel } from '../../src/components/panels/EditorFormPanel.js';
import { astToModel } from '../../src/adapters/ast-to-model.js';
import type { AnyGraphNode, TypeOption, EditorFormActions } from '../../src/types.js';

const { typeAliasFormSpy } = vi.hoisted(() => ({
  typeAliasFormSpy: vi.fn()
}));

vi.mock('../../src/components/editors/TypeAliasForm.js', () => ({
  TypeAliasForm: (props: unknown) => {
    typeAliasFormSpy(props);
    return <div data-slot="mock-type-alias-form">TypeAliasForm</div>;
  }
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeActions(): EditorFormActions {
  return {
    renameType: vi.fn(),
    deleteType: vi.fn(),
    updateDefinition: vi.fn(),
    updateComments: vi.fn(),
    addSynonym: vi.fn(),
    removeSynonym: vi.fn(),
    addAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    updateAttribute: vi.fn(),
    reorderAttribute: vi.fn(),
    setInheritance: vi.fn(),
    addEnumValue: vi.fn(),
    removeEnumValue: vi.fn(),
    updateEnumValue: vi.fn(),
    reorderEnumValue: vi.fn(),
    setEnumParent: vi.fn(),
    addChoiceOption: vi.fn(),
    removeChoiceOption: vi.fn(),
    addInputParam: vi.fn(),
    removeInputParam: vi.fn(),
    updateOutputType: vi.fn(),
    updateExpression: vi.fn(),
    validate: vi.fn().mockReturnValue([])
  };
}

const AVAILABLE_TYPES: TypeOption[] = [
  { value: 'builtin::string', label: 'string', kind: 'builtin' },
  { value: 'builtin::number', label: 'number', kind: 'builtin' }
];

function makeNodeData(overrides: Record<string, unknown> = {}): AnyGraphNode {
  return {
    $type: 'Data',
    name: 'Trade',
    namespace: 'test.model',
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
    conditions: [],
    annotations: [],
    synonyms: [],
    position: { x: 0, y: 0 },
    hasExternalRefs: false,
    errors: [],
    ...overrides
  } as AnyGraphNode;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EditorFormPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    typeAliasFormSpy.mockReset();
  });

  // ---- Empty state -------------------------------------------------------

  it('renders empty state when nodeData is null', () => {
    render(<EditorFormPanel nodeData={null} nodeId={null} availableTypes={AVAILABLE_TYPES} actions={makeActions()} />);

    expect(screen.getByText('Select a node to edit')).toBeDefined();
  });

  it('renders empty state when nodeId is null', () => {
    render(
      <EditorFormPanel
        nodeData={makeNodeData()}
        nodeId={null}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    expect(screen.getByText('Select a node to edit')).toBeDefined();
  });

  // ---- Accessibility -----------------------------------------------------

  it('has role="complementary" and aria-label', () => {
    render(
      <EditorFormPanel
        nodeData={makeNodeData()}
        nodeId="node-1"
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    const panel = screen.getByRole('complementary');
    expect(panel).toBeDefined();
    expect(panel.getAttribute('aria-label')).toBe('Edit Trade');
  });

  it('sets aria-label="Editor form" in empty state', () => {
    render(<EditorFormPanel nodeData={null} nodeId={null} availableTypes={AVAILABLE_TYPES} actions={makeActions()} />);

    const panel = screen.getByRole('complementary');
    expect(panel.getAttribute('aria-label')).toBe('Editor form');
  });

  // ---- Kind dispatch ------------------------------------------------------

  it('renders DataTypeForm for data kind', () => {
    render(
      <EditorFormPanel
        nodeData={makeNodeData({ $type: 'Data' })}
        nodeId="node-1"
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    // DataTypeForm renders a "Data" badge
    expect(screen.getAllByText('Data').length).toBeGreaterThanOrEqual(1);
    // Should show add-attribute button (icon-only post-migration; query
    // by aria-label).
    expect(screen.getByLabelText('Add attribute')).toBeDefined();
  });

  it('renders a parsed AST-backed node without recursing through runtime fields', async () => {
    const parsed = await parse(`
      namespace test.model

      type Trade:
        tradeDate date (1..1)
    `);
    const { nodes } = astToModel(parsed.value);
    const tradeNode = nodes.find((node) => node.data.name === 'Trade');

    expect(tradeNode).toBeDefined();

    render(
      <EditorFormPanel
        nodeData={tradeNode!.data}
        nodeId={tradeNode!.id}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    expect(screen.getByRole('complementary')).toBeInTheDocument();
    expect(screen.getByLabelText('Add attribute')).toBeInTheDocument();
  });

  it('renders DetailPanel for read-only nodes', () => {
    render(
      <EditorFormPanel
        nodeData={makeNodeData({ isReadOnly: true })}
        nodeId="node-1"
        isReadOnly={true}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    const panel = screen.getByRole('complementary');
    expect(panel.getAttribute('aria-label')).toBe('Details for Trade');
    // DetailPanel shows namespace label
    expect(screen.getByText('Namespace')).toBeDefined();
  });

  it('renders DetailPanel for view-only kinds (e.g. Annotation)', () => {
    render(
      <EditorFormPanel
        nodeData={makeNodeData({ $type: 'Annotation' })}
        nodeId="node-1"
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    // Falls through to DetailPanel for annotation kind — shows Namespace label
    expect(screen.getByText('Namespace')).toBeDefined();
  });

  it('forwards available types and navigation props to TypeAliasForm', () => {
    const onNavigateToNode = vi.fn();

    render(
      <EditorFormPanel
        nodeData={makeNodeData({
          $type: 'RosettaTypeAlias',
          name: 'AliasName',
          typeCall: { $type: 'TypeCall', type: { $refText: 'string' } }
        })}
        nodeId="alias-node"
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
        allNodes={
          [
            {
              id: 'alias-node',
              data: {
                $type: 'RosettaTypeAlias',
                name: 'AliasName',
                namespace: 'test.model'
              }
            },
            {
              id: 'other-node',
              data: {
                $type: 'Data',
                name: 'Trade',
                namespace: 'test.model'
              }
            }
          ] as never
        }
        onNavigateToNode={onNavigateToNode}
      />
    );

    expect(screen.getByText('TypeAliasForm')).toBeInTheDocument();
    expect(typeAliasFormSpy).toHaveBeenCalledOnce();

    const props = typeAliasFormSpy.mock.calls[0]?.[0] as {
      availableTypes?: TypeOption[];
      allNodeIds?: string[];
      onNavigateToNode?: (nodeId: string) => void;
    };

    expect(props.availableTypes).toEqual(AVAILABLE_TYPES);
    expect(props.allNodeIds).toEqual(['alias-node', 'other-node']);
    expect(props.onNavigateToNode).toBe(onNavigateToNode);
  });

  // ---- Sticky header ------------------------------------------------------

  it('renders sticky header with name and kind badge', () => {
    render(
      <EditorFormPanel
        nodeData={makeNodeData()}
        nodeId="node-1"
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    const header = document.querySelector('[data-slot="form-header"]');
    expect(header).toBeDefined();
    expect(screen.getByDisplayValue('Trade')).toBeInTheDocument();
    expect(header!.textContent).toContain('Data');
  });

  // ---- Close affordance ---------------------------------------------------

  it('does not render a header close button even when onClose is provided', () => {
    const onClose = vi.fn();

    render(
      <EditorFormPanel
        nodeData={makeNodeData()}
        nodeId="node-1"
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
        onClose={onClose}
      />
    );

    expect(screen.queryByLabelText('Close editor panel')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('complementary'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  // ---- Escape key ---------------------------------------------------------

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();

    render(
      <EditorFormPanel
        nodeData={makeNodeData()}
        nodeId="node-1"
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
        onClose={onClose}
      />
    );

    const panel = screen.getByRole('complementary');
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
