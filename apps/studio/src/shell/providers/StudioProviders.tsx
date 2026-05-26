// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type React from 'react';
import { WorkspaceProvider } from './WorkspaceProvider.js';
import { LspProvider } from './LspProvider.js';
import { CodegenProvider } from './CodegenProvider.js';
import { GitHubProvider } from './GitHubProvider.js';
import type { WorkspaceState } from './workspace-context.js';
import type { WorkspaceActions } from '../perspectives/workspace-actions-context.js';

interface Props {
  state: WorkspaceState;
  actions: WorkspaceActions;
  children: React.ReactNode;
}

/**
 * App-level composition root. Reserved app-global sibling slots (insertion
 * contract, design §10):
 *   - <GitHubProvider/>  (IMPLEMENTED) outermost; auth state from the github-auth service singleton
 *   - <SettingsProvider/> sibling; lands with .runestudio config
 *   - <CuratedModelProvider/> not warranted (registry + service + useModelStore own it)
 * Rule: nest only on context-consumption; otherwise sibling. Lsp/Codegen nest
 * under Workspace because they consume useWorkspace(); they are peers.
 * zustand stores stay module singletons — NOT mounted here.
 */
export function StudioProviders({ state, actions, children }: Props): React.ReactElement {
  return (
    <GitHubProvider>
      <WorkspaceProvider state={state} actions={actions}>
        <LspProvider>
          <CodegenProvider>{children}</CodegenProvider>
        </LspProvider>
      </WorkspaceProvider>
    </GitHubProvider>
  );
}
