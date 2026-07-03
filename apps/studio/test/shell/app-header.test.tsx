// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PERSPECTIVES } from '../../src/shell/perspectives/perspective-registry.js';
import { usePerspectiveStore } from '../../src/store/perspective-store.js';
import { AppHeader } from '../../src/shell/AppHeader.js';

describe('perspective registry chrome contract', () => {
  it('every non-explore perspective declares a bar title', () => {
    for (const p of PERSPECTIVES.filter((p) => p.id !== 'explore')) {
      expect(p.title, `${p.id} needs a title`).toBeTruthy();
    }
  });
  it('showsFileTabs is retired', () => {
    for (const p of PERSPECTIVES) {
      expect('showsFileTabs' in p, `${p.id} still carries showsFileTabs`).toBe(false);
    }
  });
});

describe('AppHeader', () => {
  afterEach(() => {
    cleanup();
    usePerspectiveStore.getState().setActivePerspective('workspaces');
  });

  it('renders exactly one app-header for a non-explore perspective', () => {
    usePerspectiveStore.getState().setActivePerspective('git');
    render(<AppHeader />);
    expect(screen.getAllByTestId('app-header')).toHaveLength(1);
  });

  it('renders the active perspective title for a non-explore perspective', () => {
    usePerspectiveStore.getState().setActivePerspective('git');
    render(<AppHeader />);
    expect(screen.getByText('Git / Sync')).toBeTruthy();
  });
});
