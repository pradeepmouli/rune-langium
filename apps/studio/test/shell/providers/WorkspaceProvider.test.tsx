// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useState, memo } from 'react';
import { WorkspaceProvider } from '../../../src/shell/providers/WorkspaceProvider.js';
import { useWorkspace } from '../../../src/shell/providers/workspace-context.js';
import { useWorkspaceActions } from '../../../src/shell/perspectives/workspace-actions-context.js';

const noopActions = {
  files: [], onFilesLoaded: () => {}, createGitBackedWorkspace: () => {},
  onGitHubWorkspaceCreated: () => {}, onOpenWorkspace: () => {},
  onCreateWorkspace: () => {}, onDeleteWorkspace: () => {}
};
function stateFor(id: string) {
  return { workspaceId: id, workspaceKind: 'browser-only' as const, workspaceName: id, fileCount: 0,
    files: [], models: [], parsedModels: [], deferredExports: [] };
}

function StateProbe() { return <span data-testid="id">{useWorkspace().workspaceId}</span>; }

describe('WorkspaceProvider', () => {
  it('publishes state + actions to consumers', () => {
    render(
      <WorkspaceProvider state={stateFor('ws-A')} actions={noopActions}>
        <StateProbe />
      </WorkspaceProvider>
    );
    expect(screen.getByTestId('id').textContent).toBe('ws-A');
  });

  it('swaps the published model atomically on a workspace change', () => {
    function Host() {
      const [id, setId] = useState('ws-A');
      return (
        <>
          <button onClick={() => setId('ws-B')}>switch</button>
          <WorkspaceProvider state={stateFor(id)} actions={noopActions}><StateProbe /></WorkspaceProvider>
        </>
      );
    }
    render(<Host />);
    expect(screen.getByTestId('id').textContent).toBe('ws-A');
    act(() => screen.getByText('switch').click());
    expect(screen.getByTestId('id').textContent).toBe('ws-B');
  });

  it('split contexts isolate re-renders: memoized action-only consumers skip state-only changes', () => {
    let actionRenders = 0;
    let stateRenders = 0;
    const ActionsOnly = memo(function ActionsOnly() { useWorkspaceActions(); actionRenders += 1; return null; });
    const StateReader = memo(function StateReader() { useWorkspace(); stateRenders += 1; return null; });

    function Host() {
      const [id, setId] = useState('ws-A');
      return (
        <>
          <button onClick={() => setId('ws-B')}>switch</button>
          <WorkspaceProvider state={stateFor(id)} actions={noopActions}>
            <ActionsOnly />
            <StateReader />
          </WorkspaceProvider>
        </>
      );
    }
    render(<Host />);
    const actionsBefore = actionRenders;
    const stateBefore = stateRenders;
    act(() => screen.getByText('switch').click());
    // State context value changed → the state reader re-renders…
    expect(stateRenders).toBeGreaterThan(stateBefore);
    // …but the memoized action-only consumer does NOT (it never subscribed to state).
    expect(actionRenders).toBe(actionsBefore);
  });
});
