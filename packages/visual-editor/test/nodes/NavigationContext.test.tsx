// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Unit tests for NavigationContext.
 *
 * Covers:
 * - useNavigation returns default context (no provider)
 * - useNavigation returns provided values when wrapped in provider
 * - resolveTypeNodeId finds exact match (not applicable — function only does suffix match)
 * - resolveTypeNodeId finds suffix match (::name)
 * - resolveTypeNodeId returns undefined for unresolvable names
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  NavigationContext,
  useNavigation,
  resolveTypeNodeId
} from '../../src/components/nodes/NavigationContext.js';

// ---------------------------------------------------------------------------
// Helper component to read context values
// ---------------------------------------------------------------------------

function ContextReader() {
  const { onNavigateToType, allNodeIds, layoutDirection } = useNavigation();
  return (
    <div>
      <span data-testid="has-callback">{onNavigateToType ? 'yes' : 'no'}</span>
      <span data-testid="node-count">{allNodeIds.size}</span>
      <span data-testid="layout-direction">{layoutDirection}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NavigationContext', () => {
  describe('useNavigation', () => {
    it('returns default context when no provider is present', () => {
      render(<ContextReader />);

      expect(screen.getByTestId('has-callback').textContent).toBe('no');
      expect(screen.getByTestId('node-count').textContent).toBe('0');
      expect(screen.getByTestId('layout-direction').textContent).toBe('TB');
    });

    it('returns provided values when wrapped in NavigationContext.Provider', () => {
      const onNavigateToType = vi.fn();
      const allNodeIds = new Set(['cdm.base.math::Quantity', 'cdm.product::Trade']);

      render(
        <NavigationContext.Provider value={{ onNavigateToType, allNodeIds, layoutDirection: 'LR' }}>
          <ContextReader />
        </NavigationContext.Provider>
      );

      expect(screen.getByTestId('has-callback').textContent).toBe('yes');
      expect(screen.getByTestId('node-count').textContent).toBe('2');
      expect(screen.getByTestId('layout-direction').textContent).toBe('LR');
    });
  });

  describe('resolveTypeNodeId', () => {
    const nodeIds = new Set([
      'cdm.base.math::Quantity',
      'cdm.base.datetime::AdjustableDate',
      'cdm.product.template::EconomicTerms'
    ]);

    it('finds suffix match for "Quantity" -> "cdm.base.math::Quantity"', () => {
      expect(resolveTypeNodeId('Quantity', nodeIds)).toBe('cdm.base.math::Quantity');
    });

    it('finds suffix match for "AdjustableDate"', () => {
      expect(resolveTypeNodeId('AdjustableDate', nodeIds)).toBe(
        'cdm.base.datetime::AdjustableDate'
      );
    });

    it('finds suffix match for "EconomicTerms"', () => {
      expect(resolveTypeNodeId('EconomicTerms', nodeIds)).toBe(
        'cdm.product.template::EconomicTerms'
      );
    });

    it('returns undefined for unresolvable names', () => {
      expect(resolveTypeNodeId('NonExistent', nodeIds)).toBeUndefined();
    });

    it('returns undefined for empty set', () => {
      expect(resolveTypeNodeId('Quantity', new Set())).toBeUndefined();
    });

    it('does not match partial suffixes (e.g., "antity" should not match "::Quantity")', () => {
      expect(resolveTypeNodeId('antity', nodeIds)).toBeUndefined();
    });
  });
});
