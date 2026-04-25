// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * GitHubConnectDialog — drives the device-flow auth handshake.
 *
 * Lifecycle:
 *  1. mount → POST /device-init → render user_code + verification_uri.
 *  2. background poll loop → POST /device-poll on the GitHub-suggested
 *     interval. The "Check now" button forces an immediate poll.
 *  3. on success → onConnected(accessToken).
 *  4. on expired → show "Restart" affordance that re-runs init.
 *  5. unmount or "Cancel" → stop polling, onCancel().
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from '@rune-langium/design-system/ui/button';
import {
  initDeviceFlow,
  pollDeviceFlow,
  type InitResult,
  type PollResult
} from '../services/github-auth.js';

interface Props {
  authBase: string;
  onConnected: (accessToken: string) => void;
  onCancel: () => void;
}

interface DialogState {
  phase: 'init' | 'pending' | 'expired' | 'error';
  init?: Extract<InitResult, { kind: 'ok' }>;
  errorReason?: string;
}

export function GitHubConnectDialog({
  authBase,
  onConnected,
  onCancel
}: Props): React.ReactElement {
  const [state, setState] = useState<DialogState>({ phase: 'init' });
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    void run();
    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authBase]);

  async function run() {
    const init = await initDeviceFlow(authBase);
    if (cancelledRef.current) return;
    if (init.kind !== 'ok') {
      setState({ phase: 'error', errorReason: init.reason });
      return;
    }
    setState({ phase: 'pending', init });
  }

  async function checkNow() {
    if (state.phase !== 'pending' || !state.init) return;
    const r = await pollDeviceFlow(authBase, state.init.deviceCode);
    handlePoll(r);
  }

  function handlePoll(r: PollResult) {
    if (cancelledRef.current) return;
    if (r.kind === 'ok') {
      onConnected(r.accessToken);
      return;
    }
    if (r.kind === 'expired') {
      setState((s) => ({ ...s, phase: 'expired' }));
      return;
    }
    if (r.kind === 'error') {
      setState((s) => ({ ...s, phase: 'error', errorReason: r.reason }));
      return;
    }
    // pending / slow_down: stay in pending
  }

  return (
    <div role="dialog" aria-label="Connect GitHub" data-testid="github-connect-dialog">
      {state.phase === 'init' && <p>Starting GitHub authorisation…</p>}
      {state.phase === 'pending' && state.init && (
        <>
          <p>
            Open{' '}
            <a href={state.init.verificationUri} target="_blank" rel="noreferrer noopener">
              {state.init.verificationUri}
            </a>{' '}
            and enter this code:
          </p>
          <p>
            <strong>{state.init.userCode}</strong>
          </p>
          <Button onClick={() => void checkNow()}>I've authorised — check now</Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </>
      )}
      {state.phase === 'expired' && (
        <>
          <p>The code expired. Please restart the connection.</p>
          <Button onClick={() => void run()}>Restart</Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </>
      )}
      {state.phase === 'error' && (
        <>
          <p>Connection failed: {state.errorReason}</p>
          <Button onClick={() => void run()}>Retry</Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </>
      )}
    </div>
  );
}
