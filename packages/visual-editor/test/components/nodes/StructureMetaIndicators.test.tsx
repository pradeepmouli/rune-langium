// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Phase A — StructureMetaIndicators surfaces a Data/Choice type's doc,
 * conditions, and annotations as header indicator buttons, each opening a
 * popover listing that meta. Indicators render ONLY when their meta is
 * non-empty.
 *
 * The popover primitive is mocked (same strategy as CardinalityPicker.test) so
 * the trigger and content render flat — no portal / open-state plumbing — and
 * we can assert on both the trigger cluster and the popover content directly.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

vi.mock('@rune-langium/design-system/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div data-testid="popover">{children}</div>,
  PopoverTrigger: ({ render }: { render: ReactElement }) => render,
  PopoverContent: ({ children }: { children: ReactNode }) => <div data-testid="popover-content">{children}</div>
}));

import { StructureMetaIndicators } from '../../../src/components/nodes/StructureMetaIndicators.js';

describe('StructureMetaIndicators', () => {
  it('renders nothing when all meta is empty', () => {
    const { container } = render(<StructureMetaIndicators />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for blank/whitespace doc and empty arrays', () => {
    const { container } = render(<StructureMetaIndicators definition="   " annotations={[]} conditions={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders only the doc indicator when only documentation is present', () => {
    render(<StructureMetaIndicators definition="A trading party." />);

    expect(screen.getByRole('button', { name: 'Documentation' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Conditions/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Annotations/ })).not.toBeInTheDocument();
    // popover content shows the doc text
    expect(screen.getByText('A trading party.')).toBeInTheDocument();
  });

  it('renders the conditions indicator with a count and lists each condition', () => {
    render(
      <StructureMetaIndicators
        conditions={[
          { name: 'NonNegative', preview: 'amount >= 0' },
          { name: '', preview: 'quantity > 0' }
        ]}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Conditions (2)' });
    expect(trigger).toHaveTextContent('2');
    // named condition + its preview
    expect(screen.getByText('NonNegative')).toBeInTheDocument();
    expect(screen.getByText('amount >= 0')).toBeInTheDocument();
    // unnamed condition falls back to its preview as the label — the preview
    // text therefore appears twice (label span + preview pre).
    expect(screen.getAllByText('quantity > 0')).toHaveLength(2);
  });

  it('renders the annotations indicator with a count and lists each annotation', () => {
    render(<StructureMetaIndicators annotations={['rootType', 'metadata.scheme']} />);

    const trigger = screen.getByRole('button', { name: 'Annotations (2)' });
    expect(trigger).toHaveTextContent('2');
    expect(screen.getByText('rootType')).toBeInTheDocument();
    expect(screen.getByText('metadata.scheme')).toBeInTheDocument();
  });

  it('renders all three indicators together when all meta is present', () => {
    render(
      <StructureMetaIndicators
        definition="Doc text"
        annotations={['rootType']}
        conditions={[{ name: 'C1', preview: 'x > 0' }]}
      />
    );

    expect(screen.getByRole('button', { name: 'Documentation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conditions (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annotations (1)' })).toBeInTheDocument();
  });
});
