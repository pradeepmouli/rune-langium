// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Palette, TypePicker } from './previews/Command.js';

afterEach(cleanup);

describe('design-sync Command previews', () => {
  it('filters grouped palette items and handles selecting a command', async () => {
    const user = userEvent.setup();
    render(<Palette />);
    expect(screen.getAllByRole('option')).toHaveLength(6);
    await user.type(screen.getByRole('combobox'), 'typescript');
    expect(screen.queryByText('Types')).toBeNull();
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.click(screen.getByRole('option', { name: /Generate TypeScript/ }));
    expect(screen.getByRole('status', { name: 'Selection' }).textContent).toContain('Selected: Generate TypeScript');
  });

  it('filters type groups and handles selecting a type', async () => {
    const user = userEvent.setup();
    render(<TypePicker />);
    expect(screen.getAllByRole('option')).toHaveLength(5);
    await user.type(screen.getByRole('combobox'), 'Period');
    expect(screen.queryByText('Built-in')).toBeNull();
    await user.click(screen.getByRole('option', { name: 'Period' }));
    expect(screen.getByRole('status', { name: 'Selection' }).textContent).toContain('Selected type: Period');
  });

  it('shows an empty state for an unmatched search', async () => {
    const user = userEvent.setup();
    render(<Palette />);
    await user.type(screen.getByRole('combobox'), 'no-matching-command');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No results found.')).not.toBeNull();
  });

  it('does not leave orphan separators when only one group matches', async () => {
    const user = userEvent.setup();
    render(<Palette />);
    await user.type(screen.getByRole('combobox'), 'typescript');
    expect(document.querySelectorAll('[data-slot="command-separator"]')).toHaveLength(0);
    await user.clear(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), 'Party');
    expect(document.querySelectorAll('[data-slot="command-separator"]')).toHaveLength(0);
  });
});
