// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PERSPECTIVES } from '../../src/shell/perspectives/perspective-registry.js';
import { usePerspectiveStore } from '../../src/store/perspective-store.js';
import { AppHeader } from '../../src/shell/AppHeader.js';
import { WorkspaceStateContext, type WorkspaceState } from '../../src/shell/providers/workspace-context.js';
import {
  WorkspaceActionsContext,
  type WorkspaceActions
} from '../../src/shell/perspectives/workspace-actions-context.js';
import { LspContext, type LspContextValue } from '../../src/shell/providers/lsp-context.js';
import { GitSyncPerspective } from '../../src/shell/perspectives/screens/GitSyncPerspective.js';
import { ExportPerspective } from '../../src/shell/perspectives/screens/ExportPerspective.js';
import { SettingsPerspective } from '../../src/shell/perspectives/screens/SettingsPerspective.js';

const noop = () => {};

function makeWorkspaceState(overrides?: Partial<WorkspaceState>): WorkspaceState {
  return {
    workspaceId: 'ws-1',
    workspaceKind: 'browser-only',
    workspaceName: 'Test workspace',
    fileCount: 1,
    files: [{ path: 'a.rosetta', name: 'a.rosetta', content: 'namespace a', dirty: false }],
    models: [],
    parsedModels: [],
    deferredExports: [],
    parseErrors: new Map(),
    ...overrides
  };
}

function makeWorkspaceActions(overrides?: Partial<WorkspaceActions>): WorkspaceActions {
  return {
    files: [],
    onFilesLoaded: noop,
    createGitBackedWorkspace: async () => ({ id: 'ws-1' }),
    onGitHubWorkspaceCreated: noop,
    onOpenWorkspace: noop,
    onCreateWorkspace: noop,
    onDeleteWorkspace: noop,
    onFilesChange: noop,
    onClose: noop,
    onSwitchWorkspace: noop,
    ...overrides
  };
}

const lspValue: LspContextValue = { lspClient: null, transportState: undefined, reconnect: noop };

function renderAppHeaderWithWorkspace(overrides?: Partial<WorkspaceState>) {
  return render(
    <WorkspaceActionsContext.Provider value={makeWorkspaceActions()}>
      <WorkspaceStateContext.Provider value={makeWorkspaceState(overrides)}>
        <LspContext.Provider value={lspValue}>
          <AppHeader />
        </LspContext.Provider>
      </WorkspaceStateContext.Provider>
    </WorkspaceActionsContext.Provider>
  );
}

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

  it('Explore renders the FileTabStrip and the model-actions cluster', () => {
    usePerspectiveStore.getState().setActivePerspective('explore');
    renderAppHeaderWithWorkspace();
    expect(screen.getByRole('button', { name: /a\.rosetta/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Validate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export code' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(screen.getByText('Generate')).toBeInTheDocument();
  });

  it('non-Explore perspectives render neither the FileTabStrip nor Explore actions', () => {
    usePerspectiveStore.getState().setActivePerspective('git');
    renderAppHeaderWithWorkspace();
    expect(screen.queryByRole('button', { name: /a\.rosetta/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Validate' })).not.toBeInTheDocument();
    expect(screen.queryByText('Generate')).not.toBeInTheDocument();
  });

  it('renders exactly one .studio-topbar for Explore', () => {
    usePerspectiveStore.getState().setActivePerspective('explore');
    const { container } = renderAppHeaderWithWorkspace();
    expect(container.querySelectorAll('.studio-topbar')).toHaveLength(1);
  });

  it('renders exactly one .studio-topbar for Settings (no workspace)', () => {
    usePerspectiveStore.getState().setActivePerspective('settings');
    const { container } = render(<AppHeader />);
    expect(container.querySelectorAll('.studio-topbar')).toHaveLength(1);
  });

  it('settings renders with NO workspace and does not throw; switcher hidden', () => {
    usePerspectiveStore.getState().setActivePerspective('settings');
    expect(() => render(<AppHeader />)).not.toThrow();
    expect(screen.queryByLabelText(/Workspace menu/)).not.toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('shows the workspace switcher for a workspace-requiring perspective with a loaded workspace', () => {
    usePerspectiveStore.getState().setActivePerspective('git');
    renderAppHeaderWithWorkspace({ workspaceName: 'CDM Workspace' });
    expect(screen.getByLabelText(/Workspace menu/)).toBeInTheDocument();
    expect(screen.getByText('CDM Workspace')).toBeInTheDocument();
  });
});

describe('perspective screens no longer render their own h1 (the bar owns the title)', () => {
  afterEach(cleanup);

  it('GitSyncPerspective has no h1', () => {
    render(<GitSyncPerspective />);
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('ExportPerspective has no h1', () => {
    render(<ExportPerspective />);
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('SettingsPerspective has no h1', () => {
    render(<SettingsPerspective />);
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });
});
