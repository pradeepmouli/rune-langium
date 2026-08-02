// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type React from 'react';
import { WorkspaceProvider } from './WorkspaceProvider.js';
import { LspProvider } from './LspProvider.js';
import { CodegenProvider } from './CodegenProvider.js';
import type { WorkspaceState } from './workspace-context.js';
import type { WorkspaceActions } from '../perspectives/workspace-actions-context.js';
import { withInstrumentation } from '../../services/instrumentation/core.js';

interface Props {
  state: WorkspaceState;
  actions: WorkspaceActions;
  children: React.ReactNode;
}

export const StudioProviders = withInstrumentation(
  function StudioProviders({ state, actions, children }: Props): React.ReactElement {
    return (
      <WorkspaceProvider state={state} actions={actions}>
        <LspProvider>
          <CodegenProvider>{children}</CodegenProvider>
        </LspProvider>
      </WorkspaceProvider>
    );
  },
  { op: 'StudioProviders' }
);
