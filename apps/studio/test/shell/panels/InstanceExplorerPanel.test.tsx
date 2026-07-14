// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InstanceExplorerPanel } from '../../../src/shell/panels/InstanceExplorerPanel.js';
import { useInstanceStore } from '../../../src/store/instance-store.js';

describe('InstanceExplorerPanel', () => {
  beforeEach(() => {
    useInstanceStore.setState({ instances: {} });
  });

  it('lists existing instances and calls onSelect when a row is clicked', () => {
    useInstanceStore.getState().createInstance('test.Party', 'My Party');
    const onSelect = vi.fn();
    render(<InstanceExplorerPanel onSelect={onSelect} selectedId={undefined} />);
    fireEvent.click(screen.getByText('My Party'));
    expect(onSelect).toHaveBeenCalledWith(expect.any(String));
  });

  it('filters the list by the search box', () => {
    useInstanceStore.getState().createInstance('test.Party', 'Alpha');
    useInstanceStore.getState().createInstance('test.Party', 'Beta');
    render(<InstanceExplorerPanel onSelect={() => {}} selectedId={undefined} />);
    fireEvent.change(screen.getByPlaceholderText('Search instances'), { target: { value: 'Alp' } });
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
  });
});
