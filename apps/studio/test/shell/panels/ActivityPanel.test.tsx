// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useContext } from 'react';
import { useActivityStore } from '../../../src/store/activity-store.js';
import { ActivityPanel } from '../../../src/shell/panels/ActivityPanel.js';
import {
  UtilityHeaderActionsContext,
  UtilityHeaderActionsProvider
} from '../../../src/shell/utility-header-actions-context.js';

afterEach(() => {
  useActivityStore.setState({ entries: [] });
});

/** The namespace filter now lives in the dockview group header (first row),
 * published through the utility header-actions registry. This probe renders
 * the published node the way DockShell's header-actions component does. */
function HeaderActionsProbe() {
  const { actions } = useContext(UtilityHeaderActionsContext);
  return <div>{actions.get('workspace.activity') ?? null}</div>;
}

function renderActivityPanel() {
  return render(
    <UtilityHeaderActionsProvider>
      <ActivityPanel />
      <HeaderActionsProbe />
    </UtilityHeaderActionsProvider>
  );
}

describe('ActivityPanel namespace filter', () => {
  it('shows all entries by default', () => {
    useActivityStore.getState().addActivity('codegen', true, 'generated');
    useActivityStore.getState().addActivity('lsp', true, 'connected');
    renderActivityPanel();
    expect(screen.getByText('generated')).toBeInTheDocument();
    expect(screen.getByText('connected')).toBeInTheDocument();
  });

  it('filters entries by the selected namespace', () => {
    useActivityStore.getState().addActivity('codegen', true, 'generated');
    useActivityStore.getState().addActivity('lsp', true, 'connected');
    renderActivityPanel();
    fireEvent.change(screen.getByTestId('activity-namespace-filter'), { target: { value: 'codegen' } });
    expect(screen.getByText('generated')).toBeInTheDocument();
    expect(screen.queryByText('connected')).not.toBeInTheDocument();
  });

  it('shows a filter-specific empty state when no entries match', () => {
    useActivityStore.getState().addActivity('lsp', true, 'connected');
    renderActivityPanel();
    fireEvent.change(screen.getByTestId('activity-namespace-filter'), { target: { value: 'git' } });
    expect(screen.getByText('No activity matches this filter.')).toBeInTheDocument();
  });
});
