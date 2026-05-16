// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for the VisualPreviewPanel Radix Tabs shell (Phase 7, Task 7.3).
 *
 * Verifies:
 * - Both tab triggers (Graph / Structure) are rendered.
 * - The Graph tab content is visible by default.
 * - The Structure tab content pane is present in the DOM.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEditorStore } from '@rune-langium/visual-editor';
import { act } from '@testing-library/react';

// Mock StructureView to avoid ReactFlow + geometry issues in jsdom
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
    // Reset editor store selection
    act(() => {
      useEditorStore.getState().selectNode(null);
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
