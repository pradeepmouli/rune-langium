/**
 * Integration tests for EditorFormPanel (T048).
 *
 * Covers:
 * - Dispatch by kind (data → DataTypeForm, readOnly → DetailPanel, null → empty)
 * - Accessibility attributes (role, aria-label)
 * - Escape key closes panel
 * - Sticky header renders name + kind badge
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorFormPanel } from '../../src/components/panels/EditorFormPanel.js';
import type { TypeNodeData, TypeOption, EditorFormActions } from '../../src/types.js';

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

function makeNodeData(overrides: Partial<TypeNodeData> = {}): TypeNodeData {
  return {
    kind: 'data',
    name: 'Trade',
    namespace: 'test.model',
    members: [
      { name: 'tradeDate', typeName: 'date', cardinality: '(1..1)', isOverride: false },
      { name: 'currency', typeName: 'string', cardinality: '(1..1)', isOverride: false }
    ],
    hasExternalRefs: false,
    errors: [],
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EditorFormPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Empty state -------------------------------------------------------

  it('renders empty state when nodeData is null', () => {
    render(
      <EditorFormPanel
        nodeData={null}
        nodeId={null}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

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
    render(
      <EditorFormPanel
        nodeData={null}
        nodeId={null}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    const panel = screen.getByRole('complementary');
    expect(panel.getAttribute('aria-label')).toBe('Editor form');
  });

  // ---- Kind dispatch ------------------------------------------------------

  it('renders DataTypeForm for data kind', () => {
    render(
      <EditorFormPanel
        nodeData={makeNodeData({ kind: 'data' })}
        nodeId="node-1"
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    // DataTypeForm renders a "Data" badge
    expect(screen.getAllByText('Data').length).toBeGreaterThanOrEqual(1);
    // Should show add-attribute button
    expect(screen.getByText(/Add Attribute/)).toBeDefined();
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

  it('renders DetailPanel for unknown kind', () => {
    render(
      <EditorFormPanel
        nodeData={makeNodeData({ kind: 'unknown' as 'data' })}
        nodeId="node-1"
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    // Falls through to DetailPanel default case — shows Namespace label
    expect(screen.getByText('Namespace')).toBeDefined();
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

    const header = document.querySelector('[data-slot="panel-header"]');
    expect(header).toBeDefined();
    expect(header!.textContent).toContain('Trade');
  });

  // ---- Close button -------------------------------------------------------

  it('renders close button when onClose is provided', () => {
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

    const closeBtn = screen.getByLabelText('Close editor panel');
    expect(closeBtn).toBeDefined();

    fireEvent.click(closeBtn);
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
