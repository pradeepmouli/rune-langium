// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileTreePanel } from '../../src/shell/panels/FileTreePanel.js';

describe('FileTreePanel', () => {
  it('highlights the active file and opens files on click', () => {
    const onOpen = vi.fn();

    render(
      <FileTreePanel
        files={[{ path: 'alpha/trade.rosetta' }, { path: 'beta/event.rosetta' }]}
        activePath="beta/event.rosetta"
        onOpen={onOpen}
      />
    );

    expect(screen.getByRole('treeitem', { selected: true })).toBeTruthy();

    fireEvent.click(screen.getByTestId('file-tree-item-alpha/trade.rosetta'));
    expect(onOpen).toHaveBeenCalledWith('alpha/trade.rosetta');
  });
});
