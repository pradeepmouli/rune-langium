/**
 * Unit tests for TypeLink component.
 *
 * Covers:
 * - Renders nothing when typeName is undefined
 * - Renders plain span when no onNavigateToNode callback
 * - Renders clickable button when onNavigateToNode is provided and type resolves
 * - Renders disabled button when type doesn't resolve to any nodeId
 * - Calls onNavigateToNode with correct nodeId when clicked
 * - resolveNodeId matches exact IDs
 * - resolveNodeId matches ::suffix pattern
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TypeLink } from '../../src/components/editors/TypeLink.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TypeLink', () => {
  const ALL_NODE_IDS = [
    'cdm.base.math::Quantity',
    'cdm.base.datetime::AdjustableDate',
    'cdm.product.template::EconomicTerms',
    'CompareOp'
  ];

  it('renders nothing when typeName is undefined', () => {
    const { container } = render(<TypeLink typeName={undefined} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders plain span when no onNavigateToNode callback', () => {
    render(<TypeLink typeName="Quantity" />);
    const el = screen.getByText('Quantity');
    expect(el.tagName).toBe('SPAN');
  });

  it('renders clickable button when onNavigateToNode is provided and type resolves', () => {
    const onNavigate = vi.fn();
    render(
      <TypeLink typeName="Quantity" onNavigateToNode={onNavigate} allNodeIds={ALL_NODE_IDS} />
    );

    const btn = screen.getByRole('button');
    expect(btn).toBeDefined();
    expect(btn).toHaveProperty('disabled', false);
    expect(btn.title).toBe('Go to Quantity');
  });

  it('renders disabled button when type does not resolve to any nodeId', () => {
    const onNavigate = vi.fn();
    render(
      <TypeLink
        typeName="NonExistentType"
        onNavigateToNode={onNavigate}
        allNodeIds={ALL_NODE_IDS}
      />
    );

    const btn = screen.getByRole('button');
    expect(btn).toHaveProperty('disabled', true);
    expect(btn.title).toBe('NonExistentType');
  });

  it('calls onNavigateToNode with correct nodeId when clicked', () => {
    const onNavigate = vi.fn();
    render(
      <TypeLink typeName="Quantity" onNavigateToNode={onNavigate} allNodeIds={ALL_NODE_IDS} />
    );

    const btn = screen.getByRole('button');
    fireEvent.click(btn);

    expect(onNavigate).toHaveBeenCalledOnce();
    expect(onNavigate).toHaveBeenCalledWith('cdm.base.math::Quantity');
  });

  it('does not call onNavigateToNode when allNodeIds is not provided', () => {
    const onNavigate = vi.fn();
    render(<TypeLink typeName="Quantity" onNavigateToNode={onNavigate} />);

    const btn = screen.getByRole('button');
    fireEvent.click(btn);

    expect(onNavigate).not.toHaveBeenCalled();
  });

  describe('resolveNodeId', () => {
    it('matches exact IDs', () => {
      const onNavigate = vi.fn();
      render(
        <TypeLink typeName="CompareOp" onNavigateToNode={onNavigate} allNodeIds={ALL_NODE_IDS} />
      );

      fireEvent.click(screen.getByRole('button'));
      expect(onNavigate).toHaveBeenCalledWith('CompareOp');
    });

    it('matches ::suffix pattern (e.g., "Quantity" matches "cdm.base.math::Quantity")', () => {
      const onNavigate = vi.fn();
      render(
        <TypeLink typeName="Quantity" onNavigateToNode={onNavigate} allNodeIds={ALL_NODE_IDS} />
      );

      fireEvent.click(screen.getByRole('button'));
      expect(onNavigate).toHaveBeenCalledWith('cdm.base.math::Quantity');
    });

    it('matches ::suffix for AdjustableDate', () => {
      const onNavigate = vi.fn();
      render(
        <TypeLink
          typeName="AdjustableDate"
          onNavigateToNode={onNavigate}
          allNodeIds={ALL_NODE_IDS}
        />
      );

      fireEvent.click(screen.getByRole('button'));
      expect(onNavigate).toHaveBeenCalledWith('cdm.base.datetime::AdjustableDate');
    });
  });
});
