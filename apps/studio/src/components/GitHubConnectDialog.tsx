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

import { useEffect, useRef, useState } from 'react';
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
  // Fix 6: track when the provider is connected but the IDB token read returned
  // null/empty — surfaces an explicit error instead of leaving the dialog stuck.
  const [tokenLookupFailed, setTokenLookupFailed] = useState(false);

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
        if (token) {
          onConnected(token);
        } else {
          // Fix 6: connected but IDB token is null/empty — reset the guard so
          // a retry attempt can re-fire onConnected after reconnecting.
          connectedFiredRef.current = false;
          setTokenLookupFailed(true);
        }
      })();
    }
  }, [status, onConnected]);

  // Fix 6: connected but token retrieval failed — surface an explicit error so
  // the user is not trapped on the "Starting…" view with no recovery path.
  if (status === 'connected' && tokenLookupFailed) {
    return (
      <div role="dialog" aria-label="Connect GitHub" data-testid="github-connect-dialog">
        <p data-testid="github-token-error">
          Could not retrieve the GitHub token — please reconnect.
        </p>
        <Button
          onClick={() => {
            setTokenLookupFailed(false);
            void connect();
          }}
        >
          Reconnect
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    );
  }

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
          {/* Fix 4: Replace the misleading interactive no-op button with static
              informational copy. The provider drives its own auto-poll loop. */}
          <p data-testid="github-auth-checking">Waiting for authorization — checking automatically…</p>
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
