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
import { Alert, AlertDescription, AlertTitle } from '@rune-langium/design-system/ui/alert';
import { GitHubConnectDialog } from './GitHubConnectDialog.js';
import { loadGlobalGithubToken } from '../services/github-store.js';

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
  /**
   * When the global GitHub connection is already established (status ===
   * 'connected'), pass `skipAuth={true}` to skip the device-flow dialog
   * and go directly to the URL form. The token is read lazily from IDB
   * at the moment of clone (never held in React state). The per-workspace
   * OPFS copy is still written by `createWorkspace`
   * (via `WorkspaceManager.createGitBacked → storeWorkspaceToken`).
   */
  skipAuth?: boolean;
}

interface FlowState {
  phase: 'auth' | 'url' | 'cloning' | 'error';
  token?: string;
  errorReason?: string;
}

/**
 * Translate raw clone errors (e.g. "HTTP 404", network failures) into copy
 * the user can act on. Falls back to the raw message for anything we don't
 * recognise so we never silently swallow a useful detail.
 */
function friendlyCloneError(raw: string): { headline: string; hint?: string } {
  const msg = raw.trim();
  // Auth sentinel — set locally before any clone attempt; "Clone failed" would be misleading.
  if (/no github token/i.test(msg) || /please reconnect/i.test(msg)) {
    return {
      headline: 'Not connected to GitHub',
      hint: 'Your GitHub session has expired or could not be read. Please reconnect and try again.'
    };
  }
  // isomorphic-git surfaces server status as "HTTP Error: 404 Not Found".
  if (/\b(HTTP\s*(Error)?:?\s*)?404\b/i.test(msg)) {
    return {
      headline: 'Repository not found',
      hint: "Check the URL — the repo may not exist, or it may be private and your account doesn't have access. Public repos work without extra permissions; private repos need a token with repo scope."
    };
  }
  if (/\b(HTTP\s*(Error)?:?\s*)?(401|403)\b/i.test(msg) || /unauthor|forbidden|denied/i.test(msg)) {
    return {
      headline: 'Permission denied',
      hint: "Your GitHub authorisation doesn't have access to this repository. If it's a private repo, reconnect and grant access, or pick a different repo."
    };
  }
  if (/network|fetch|failed to fetch|timeout|offline/i.test(msg)) {
    return {
      headline: 'Network problem',
      hint: "We couldn't reach GitHub. Check your connection and try again."
    };
  }
  if (/\bbranch\b/i.test(msg) && /not found|unknown/i.test(msg)) {
    return {
      headline: 'Branch not found',
      hint: "Double-check the branch name (case-sensitive). Most repos use 'main' or 'master'."
    };
  }
  return { headline: 'Clone failed', hint: msg };
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
  createWorkspace,
  skipAuth
}: GitHubWorkspaceFlowProps): React.ReactElement {
  // When `skipAuth` is true (global connection already established),
  // skip the device-flow auth phase and start directly at the URL form.
  // No token is held in state; it is resolved lazily from IDB at clone time.
  const [state, setState] = useState<FlowState>(
    skipAuth ? { phase: 'url' } : { phase: 'auth' }
  );
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
      {state.phase === 'error' &&
        state.errorReason &&
        (() => {
          const friendly = friendlyCloneError(state.errorReason);
          return (
            <Alert variant="destructive" data-testid="github-clone-error">
              <AlertTitle>{friendly.headline}</AlertTitle>
              {friendly.hint && <AlertDescription>{friendly.hint}</AlertDescription>}
            </Alert>
          );
        })()}
      <Button
        disabled={!canSubmit}
        onClick={async () => {
          if (!parsed) return;
          // Fix 1: resolve the token lazily from IDB at the moment of clone.
          // If the flow went through device-auth, state.token was set by
          // onConnected; if skipAuth was true, we read from IDB now (never
          // held in React state).
          const token = state.token ?? (await loadGlobalGithubToken());
          if (!token) {
            // Token is unexpectedly absent — surface error, revert to auth phase.
            setState({
              phase: 'error',
              errorReason: 'No GitHub token found — please reconnect.'
            });
            return;
          }
          setState({ phase: 'cloning', token });
          try {
            const result = await createWorkspace({
              name: `${parsed.user}/${parsed.repo}`,
              repoUrl: parsed.canonicalUrl,
              branch: branch.trim() || 'main',
              user: parsed.user,
              token
            });
            onCreated(result.id);
          } catch (err) {
            setState({
              phase: 'error',
              token,
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
