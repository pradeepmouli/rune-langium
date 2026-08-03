// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useActivityStore } from '../../../src/store/activity-store.js';
import { ActivityPanel } from '../../../src/shell/panels/ActivityPanel.js';

afterEach(() => {
  useActivityStore.setState({ entries: [] });
});

describe('ActivityPanel namespace filter', () => {
  it('shows all entries by default', () => {
    useActivityStore.getState().addActivity('codegen', true, 'generated');
    useActivityStore.getState().addActivity('lsp', true, 'connected');
    render(<ActivityPanel />);
    expect(screen.getByText('generated')).toBeInTheDocument();
    expect(screen.getByText('connected')).toBeInTheDocument();
  });

  it('filters entries by the selected namespace', () => {
    useActivityStore.getState().addActivity('codegen', true, 'generated');
    useActivityStore.getState().addActivity('lsp', true, 'connected');
    render(<ActivityPanel />);
    fireEvent.change(screen.getByTestId('activity-namespace-filter'), { target: { value: 'codegen' } });
    expect(screen.getByText('generated')).toBeInTheDocument();
    expect(screen.queryByText('connected')).not.toBeInTheDocument();
  });

  it('shows a filter-specific empty state when no entries match', () => {
    useActivityStore.getState().addActivity('lsp', true, 'connected');
    render(<ActivityPanel />);
    fireEvent.change(screen.getByTestId('activity-namespace-filter'), { target: { value: 'git' } });
    expect(screen.getByText('No activity matches this filter.')).toBeInTheDocument();
  });
});
