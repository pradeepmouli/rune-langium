// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type React from 'react';
import { WorkspaceStateContext, type WorkspaceState } from './workspace-context.js';
import { WorkspaceActionsContext, type WorkspaceActions } from '../perspectives/workspace-actions-context.js';

interface Props {
  state: WorkspaceState;
  actions: WorkspaceActions;
  children: React.ReactNode;
}

/**
 * Supplies the two workspace contexts. App (the workspace-selection/boot owner,
 * Approach B) computes `state` (current-model data) and `actions` (handlers) and
 * passes them here; this is the single seam consumers read from. The two contexts
 * are split so a consumer that reads only actions (via useWorkspaceActions) does
 * not subscribe to state changes — memoized action-only consumers skip re-render
 * when only the model data changes. The component never remounts on a workspace
 * switch — only the `state` value object changes.
 */
export function WorkspaceProvider({ state, actions, children }: Props): React.ReactElement {
  return (
    <WorkspaceActionsContext.Provider value={actions}>
      <WorkspaceStateContext.Provider value={state}>{children}</WorkspaceStateContext.Provider>
    </WorkspaceActionsContext.Provider>
  );
}
