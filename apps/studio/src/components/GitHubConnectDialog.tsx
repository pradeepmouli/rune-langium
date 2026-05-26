// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * GitHubConnectDialog — thin view of the app-global GithubProvider state.
 *
 * The device-flow lifecycle (init → poll → connected/error) is now owned by
 * GithubProvider (app-global). This component only:
 *  1. Calls connect() on mount (if not already connecting/connected).
 *  2. Maps provider state → the original per-phase UI.
 *  3. Fires onConnected(accessToken) once when status becomes 'connected'.
 *  4. Fires onCancel() when the user clicks Cancel/Close.
 *
 * The `authBase` prop is preserved for Props-contract compatibility but is
 * now vestigial — the provider uses getGithubAuthBase() internally.
 *
 * The "I've authorised — check now" button is retained in the markup for
 * backward compatibility but is a no-op: the provider drives its own poll
 * loop and does not expose a "force poll now" hook.
 */

import { useEffect, useRef } from 'react';
import { Button } from '@rune-langium/design-system/ui/button';
import { useGithub } from '../shell/providers/github-context.js';
import { categoryCopy } from '../services/github-error-copy.js';
import { loadGlobalGithubToken } from '../services/github-store.js';

interface Props {
  /** Preserved for Props-contract compatibility; vestigial — provider uses getGithubAuthBase(). */
  authBase: string;
  onConnected: (accessToken: string) => void;
  onCancel: () => void;
}

export function GitHubConnectDialog({
  onConnected,
  onCancel
}: Props): React.ReactElement {
  const github = useGithub();
  const { status, deviceFlow, error, errorCategory, connect } = github;
  const connectedFiredRef = useRef(false);

  // Trigger connect() on mount unless already connecting or connected.
  useEffect(() => {
    if (status === 'disconnected' || status === 'error') {
      void connect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fire onConnected exactly once when the provider reaches 'connected'.
  // Reads the token from IDB (where GithubProvider.connect() persisted it via
  // saveGlobalGithub BEFORE setting status to 'connected') so the raw token
  // never travels through the React context value.
  useEffect(() => {
    if (status === 'connected' && !connectedFiredRef.current) {
      // Set the guard before the await so a double-invoke (React strict mode)
      // or a re-render mid-await cannot fire onConnected twice.
      connectedFiredRef.current = true;
      void (async () => {
        const token = await loadGlobalGithubToken();
        // Only fire onConnected when a real token is present; a null/empty
        // token means the store is unexpectedly empty — do not start a
        // tokenless clone.
        if (token) {
          onConnected(token);
        }
      })();
    }
  }, [status, onConnected]);

  // Map provider status → the original phase UI.

  // init phase: connecting but no deviceFlow yet
  if (status === 'connecting' && !deviceFlow) {
    return (
      <div role="dialog" aria-label="Connect GitHub" data-testid="github-connect-dialog">
        <p>Starting GitHub authorisation…</p>
      </div>
    );
  }

  // pending phase: connecting + deviceFlow present (user code available)
  if (status === 'connecting' && deviceFlow) {
    return (
      <div role="dialog" aria-label="Connect GitHub" data-testid="github-connect-dialog">
        <>
          <p>
            Open{' '}
            <a href={deviceFlow.verificationUri} target="_blank" rel="noreferrer noopener">
              {deviceFlow.verificationUri}
            </a>{' '}
            and enter this code:
          </p>
          <p>
            <strong>{deviceFlow.userCode}</strong>
          </p>
          {/* "Check now" is preserved for markup compatibility; provider drives its own poll loop. */}
          <Button onClick={() => { /* no-op: provider drives polling */ }}>I&apos;ve authorised — check now</Button>
          <Button
            variant="ghost"
            onClick={onCancel}
          >
            Cancel
          </Button>
        </>
      </div>
    );
  }

  // connected phase: onConnected already fired via effect; show brief loading state
  if (status === 'connected') {
    return (
      <div role="dialog" aria-label="Connect GitHub" data-testid="github-connect-dialog">
        <p>Starting GitHub authorisation…</p>
      </div>
    );
  }

  // error phase
  if (status === 'error') {
    return (
      <div role="dialog" aria-label="Connect GitHub" data-testid="github-connect-dialog">
        <>
          <p>{categoryCopy(errorCategory, error ?? '')}</p>
          <Button onClick={() => { connectedFiredRef.current = false; void connect(); }}>Retry</Button>
          <Button
            variant="ghost"
            onClick={onCancel}
          >
            Cancel
          </Button>
        </>
      </div>
    );
  }

  // disconnected (initial state before first effect fires)
  return (
    <div role="dialog" aria-label="Connect GitHub" data-testid="github-connect-dialog">
      <p>Starting GitHub authorisation…</p>
    </div>
  );
}
