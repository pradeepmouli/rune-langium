// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TargetSwitcher } from '../../src/components/TargetSwitcher.js';

describe('TargetSwitcher', () => {
  it('renders three tabs: Zod, JSON Schema, TypeScript', () => {
    render(<TargetSwitcher value="zod" onChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Zod' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'JSON Schema' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'TypeScript' })).toBeInTheDocument();
  });

  it('marks active tab with aria-selected="true"', () => {
    render(<TargetSwitcher value="zod" onChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Zod' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'JSON Schema' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
  });

  it('calls onChange("zod") when Zod tab clicked', () => {
    const onChange = vi.fn();
    render(<TargetSwitcher value="json-schema" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Zod' }));
    expect(onChange).toHaveBeenCalledWith('zod');
  });

  it('calls onChange("json-schema") when JSON Schema tab clicked', () => {
    const onChange = vi.fn();
    render(<TargetSwitcher value="zod" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'JSON Schema' }));
    expect(onChange).toHaveBeenCalledWith('json-schema');
  });

  it('calls onChange("typescript") when TypeScript tab clicked', () => {
    const onChange = vi.fn();
    render(<TargetSwitcher value="zod" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'TypeScript' }));
    expect(onChange).toHaveBeenCalledWith('typescript');
  });

  it('has role="tablist" container for keyboard navigation', () => {
    const { container } = render(<TargetSwitcher value="zod" onChange={vi.fn()} />);
    expect(container.querySelector('[role="tablist"]')).toBeInTheDocument();
  });
});
