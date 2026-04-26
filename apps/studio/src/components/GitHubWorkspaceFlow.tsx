// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * GitHubWorkspaceFlow — wraps the auth dialog with a follow-up
 * "paste your repo URL" step + the actual clone (T032e).
 *
 * Lifecycle:
 *  1. mount        → render <GitHubConnectDialog/>; user does device flow
 *  2. on token     → render the URL form; user enters repo URL + branch
 *  3. on submit    → call WorkspaceManager.createGitBacked + onCreated
 *  4. cancel/back  → onCancel closes the whole flow
 *
 * This is the missing piece between US5's auth dialog (T031/T032b) and
 * actual workspace creation. It exists as a separate component so the
 * auth dialog stays focused on the device-flow handshake.
 */

import { useState } from 'react';
import { Button } from '@rune-langium/design-system/ui/button';
import { GitHubConnectDialog } from './GitHubConnectDialog.js';

export interface GitHubWorkspaceFlowProps {
  authBase: string;
  /** Called when the user successfully clones a repo into a new workspace. */
  onCreated: (workspaceId: string) => void;
  /** Called when the user closes the flow without creating a workspace. */
  onCancel: () => void;
  /**
   * Performs the actual clone. Injected so this component is testable
   * without a real OPFS root. Production callers pass a thin wrapper
   * over `WorkspaceManager.createGitBacked`.
   */
  createWorkspace: (input: {
    name: string;
    repoUrl: string;
    branch: string;
    user: string;
    token: string;
  }) => Promise<{ id: string }>;
}

interface FlowState {
  phase: 'auth' | 'url' | 'cloning' | 'error';
  token?: string;
  errorReason?: string;
}

/**
 * Best-effort parse of a GitHub repo URL into `{ owner, repo, user }`.
 * Recognises the four common shapes so the user can paste any of them:
 *   - https://github.com/owner/repo
 *   - https://github.com/owner/repo.git
 *   - git@github.com:owner/repo.git
 *   - owner/repo
 */
function parseRepoUrl(raw: string): { user: string; repo: string; canonicalUrl: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let m = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (!m) m = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) m = trimmed.match(/^([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
  if (!m) return null;
  const user = m[1]!;
  const repo = m[2]!;
  return { user, repo, canonicalUrl: `https://github.com/${user}/${repo}.git` };
}

export function GitHubWorkspaceFlow({
  authBase,
  onCreated,
  onCancel,
  createWorkspace
}: GitHubWorkspaceFlowProps): React.ReactElement {
  const [state, setState] = useState<FlowState>({ phase: 'auth' });
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');

  if (state.phase === 'auth') {
    return (
      <GitHubConnectDialog
        authBase={authBase}
        onConnected={(token) => setState({ phase: 'url', token })}
        onCancel={onCancel}
      />
    );
  }

  if (state.phase === 'cloning') {
    return (
      <div role="dialog" aria-label="Cloning repository" data-testid="github-cloning">
        <p>Cloning repository — this may take ~30 seconds for a fresh repo…</p>
      </div>
    );
  }

  // 'url' or 'error' — both render the form, with an error banner on retry.
  const parsed = parseRepoUrl(repoUrl);
  const canSubmit = parsed !== null;

  return (
    <div role="dialog" aria-label="Choose a repository" data-testid="github-repo-form">
      <p>Authorisation succeeded. Paste the repository URL to clone.</p>
      <label htmlFor="repo-url-input">Repository URL or owner/repo</label>
      <input
        id="repo-url-input"
        data-testid="repo-url-input"
        type="text"
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
        placeholder="https://github.com/owner/repo"
      />
      <label htmlFor="repo-branch-input">Branch</label>
      <input
        id="repo-branch-input"
        data-testid="repo-branch-input"
        type="text"
        value={branch}
        onChange={(e) => setBranch(e.target.value)}
        placeholder="main"
      />
      {state.phase === 'error' && state.errorReason && (
        <p data-testid="github-clone-error">Clone failed: {state.errorReason}</p>
      )}
      <Button
        disabled={!canSubmit}
        onClick={async () => {
          if (!parsed || !state.token) return;
          setState({ phase: 'cloning', token: state.token });
          try {
            const result = await createWorkspace({
              name: `${parsed.user}/${parsed.repo}`,
              repoUrl: parsed.canonicalUrl,
              branch: branch.trim() || 'main',
              user: parsed.user,
              token: state.token
            });
            onCreated(result.id);
          } catch (err) {
            setState({
              phase: 'error',
              token: state.token,
              errorReason: err instanceof Error ? err.message : String(err)
            });
          }
        }}
      >
        Clone
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
