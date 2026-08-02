// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type React from 'react';
import { WorkspaceStateContext, type WorkspaceState } from './workspace-context.js';
import { WorkspaceActionsContext, type WorkspaceActions } from '../perspectives/workspace-actions-context.js';
import { withInstrumentation } from '../../services/instrumentation/core.js';

interface Props {
  state: WorkspaceState;
  actions: WorkspaceActions;
  children: React.ReactNode;
}

export const WorkspaceProvider = withInstrumentation(
  function WorkspaceProvider({ state, actions, children }: Props): React.ReactElement {
    return (
      <WorkspaceActionsContext.Provider value={actions}>
        <WorkspaceStateContext.Provider value={state}>{children}</WorkspaceStateContext.Provider>
      </WorkspaceActionsContext.Provider>
    );
  },
  { op: 'WorkspaceProvider' }
);
