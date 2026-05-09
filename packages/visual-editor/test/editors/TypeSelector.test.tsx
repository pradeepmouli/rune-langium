// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { ComponentProps, ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TypeOption } from '../../src/types.js';

vi.mock('@rune-langium/design-system/ui/badge', () => ({
  badgeVariants: () => 'badge'
}));

vi.mock('@rune-langium/design-system/ui/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div data-testid="select-root">{children}</div>,
  SelectContent: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div data-testid="select-content" className={className}>
      {children}
    </div>
  ),
  SelectGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <div data-testid={`select-item-${value}`}>{children}</div>
  ),
  SelectLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, className, ...props }: ComponentProps<'button'>) => (
    <button type="button" className={className} {...props}>
      {children}
    </button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>
}));

import { TypeSelector } from '../../src/components/editors/TypeSelector.js';

const OPTIONS: TypeOption[] = [
  { value: 'builtin::string', label: 'string', kind: 'builtin' },
  { value: 'test.ns::Trade', label: 'Trade', kind: 'data', namespace: 'test.ns' }
];

describe('TypeSelector', () => {
  it('adds the bounded scrollable content class to the fallback select menu', () => {
    render(<TypeSelector value={null} options={OPTIONS} onSelect={() => {}} />);

    expect(screen.getByTestId('select-content')).toHaveClass('rune-type-selector__content');
  });
});
