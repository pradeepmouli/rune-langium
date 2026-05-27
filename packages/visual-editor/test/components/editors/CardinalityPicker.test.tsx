// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';

const SelectContext = createContext<{ onValueChange?: (value: string) => void }>({});

vi.mock('@rune-langium/design-system/ui/select', () => ({
  Select: ({
    children,
    onValueChange,
    value
  }: {
    children: ReactNode;
    onValueChange?: (value: string) => void;
    value?: string | null;
  }) => (
    <SelectContext.Provider value={{ onValueChange }}>
      <div data-testid="select-root" data-value={value ?? ''}>
        {children}
      </div>
    </SelectContext.Provider>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => {
    const { onValueChange } = useContext(SelectContext);
    return (
      <button type="button" role="option" onClick={() => onValueChange?.(value)}>
        {children}
      </button>
    );
  },
  SelectTrigger: ({ children, className, ...props }: ComponentProps<'button'>) => (
    <button type="button" role="combobox" className={className} {...props}>
      {children}
    </button>
  ),
  SelectValue: ({ placeholder, children }: { placeholder?: ReactNode; children?: ReactNode }) => (
    <span
      data-slot="select-value"
      className={children == null && placeholder != null ? 'text-muted-foreground' : undefined}
    >
      {children ?? placeholder}
    </span>
  )
}));

import { CardinalityPicker } from '../../../src/components/editors/CardinalityPicker.js';

describe('CardinalityPicker', () => {
  it('renders an empty value as placeholder text instead of a selected custom value', () => {
    render(<CardinalityPicker value="" onChange={vi.fn()} />);

    const trigger = screen.getByRole('combobox', { name: 'Cardinality' });
    expect(trigger).toHaveTextContent('1..1');
    expect(trigger.querySelector('[data-slot="select-value"]')).toHaveClass('text-muted-foreground');
  });

  it('commits a custom value with canonical parentheses', async () => {
    const onChange = vi.fn();

    render(<CardinalityPicker value="(0..1)" onChange={onChange} />);

    fireEvent.click(await screen.findByRole('option', { name: 'Custom…' }));

    const input = screen.getByLabelText('Custom cardinality');
    fireEvent.change(input, { target: { value: '2..3' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('(2..3)');
  });
});
