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
  type PollResult,
  type GitHubAuthErrorCategory
} from '../services/github-auth.js';

/**
 * User-facing copy per error category (FR-006 / EC-6). Surfaces the
 * github-auth Worker's structured failures as plain English instead
 * of a raw `HTTP 5xx` string.
 */
function categoryCopy(category: GitHubAuthErrorCategory, fallback: string): string {
  switch (category) {
    case 'misconfigured':
      return 'GitHub authorisation is not yet available — please come back later.';
    case 'unavailable':
      return 'GitHub appears to be down — please retry shortly.';
    case 'origin_blocked':
      return 'Studio configuration error — contact support.';
    case 'unknown':
    default:
      return `Connection failed: ${fallback}`;
  }
}

interface Props {
  authBase: string;
  onConnected: (accessToken: string) => void;
  onCancel: () => void;
}

interface DialogState {
  phase: 'init' | 'pending' | 'expired' | 'access_denied' | 'error';
  init?: Extract<InitResult, { kind: 'ok' }>;
  errorReason?: string;
  errorCategory?: GitHubAuthErrorCategory;
}

export function GitHubConnectDialog({
  authBase,
  onConnected,
  onCancel
}: Props): React.ReactElement {
  const [state, setState] = useState<DialogState>({ phase: 'init' });
  const cancelledRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearPollTimer(): void {
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  useEffect(() => {
    cancelledRef.current = false;
    void run();
    return () => {
      cancelledRef.current = true;
      clearPollTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authBase]);

  async function run() {
    clearPollTimer();
    const init = await initDeviceFlow(authBase);
    if (cancelledRef.current) return;
    if (init.kind !== 'ok') {
      setState({
        phase: 'error',
        errorReason: init.reason,
        errorCategory: init.category
      });
      return;
    }
    setState({ phase: 'pending', init });
    // Kick off the background poll loop. checkNow() drives the same handler.
    schedulePoll(init.deviceCode, init.intervalSec);
  }

  function schedulePoll(deviceCode: string, intervalSec: number): void {
    clearPollTimer();
    if (cancelledRef.current) return;
    const ms = Math.max(1, intervalSec) * 1000;
    pollTimerRef.current = setTimeout(() => {
      void backgroundPoll(deviceCode, intervalSec);
    }, ms);
  }

  async function backgroundPoll(deviceCode: string, intervalSec: number): Promise<void> {
    if (cancelledRef.current) return;
    const r = await pollDeviceFlow(authBase, deviceCode);
    if (cancelledRef.current) return;
    handlePoll(r);
    // Only continue polling while we're still pending / told to slow down.
    if (r.kind === 'pending') {
      schedulePoll(deviceCode, intervalSec);
    } else if (r.kind === 'slow_down') {
      // RFC 8628 §3.5 — back off by ~5s on slow_down. Tests can pass a small
      // initial interval and still observe the bump.
      schedulePoll(deviceCode, intervalSec + 5);
    }
    // ok / expired / error all stop the loop (handlePoll already updated state).
  }

  async function checkNow() {
    if (state.phase !== 'pending' || !state.init) return;
    // Don't double-fire if a background tick just landed.
    clearPollTimer();
    const init = state.init;
    const r = await pollDeviceFlow(authBase, init.deviceCode);
    if (cancelledRef.current) return;
    handlePoll(r);
    if (r.kind === 'pending' || r.kind === 'slow_down') {
      schedulePoll(init.deviceCode, init.intervalSec + (r.kind === 'slow_down' ? 5 : 0));
    }
  }

  function handlePoll(r: PollResult) {
    if (cancelledRef.current) return;
    if (r.kind === 'ok') {
      clearPollTimer();
      onConnected(r.accessToken);
      return;
    }
    if (r.kind === 'expired') {
      clearPollTimer();
      setState((s) => ({ ...s, phase: 'expired' }));
      return;
    }
    if (r.kind === 'access_denied') {
      clearPollTimer();
      setState((s) => ({ ...s, phase: 'access_denied' }));
      return;
    }
    if (r.kind === 'error') {
      clearPollTimer();
      setState((s) => ({
        ...s,
        phase: 'error',
        errorReason: r.reason,
        errorCategory: r.category
      }));
      return;
    }
    // pending / slow_down: stay in pending; caller (re)schedules the next tick.
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
          <Button
            variant="ghost"
            onClick={() => {
              cancelledRef.current = true;
              clearPollTimer();
              onCancel();
            }}
          >
            Cancel
          </Button>
        </>
      )}
      {state.phase === 'expired' && (
        <>
          <p>The code expired. Please restart the connection.</p>
          <Button onClick={() => void run()}>Restart</Button>
          <Button
            variant="ghost"
            onClick={() => {
              cancelledRef.current = true;
              clearPollTimer();
              onCancel();
            }}
          >
            Cancel
          </Button>
        </>
      )}
      {state.phase === 'access_denied' && (
        <>
          <p>Authorisation declined. You can try again or close this dialog.</p>
          <Button onClick={() => void run()}>Retry</Button>
          <Button
            variant="ghost"
            onClick={() => {
              cancelledRef.current = true;
              clearPollTimer();
              onCancel();
            }}
          >
            Close
          </Button>
        </>
      )}
      {state.phase === 'error' && (
        <>
          <p>{categoryCopy(state.errorCategory ?? 'unknown', state.errorReason ?? '')}</p>
          <Button onClick={() => void run()}>Retry</Button>
          <Button
            variant="ghost"
            onClick={() => {
              cancelledRef.current = true;
              clearPollTimer();
              onCancel();
            }}
          >
            Cancel
          </Button>
        </>
      )}
    </div>
  );
}
