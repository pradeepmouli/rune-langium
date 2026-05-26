// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GitHubContext, type GitHubContextValue, type GitHubIdentity } from './github-context.js';
import { getGitHubAuthBase } from '../../services/github-authbase.js';
import { initDeviceFlow, pollDeviceFlow, fetchGitHubUser, type GitHubAuthErrorCategory } from '../../services/github-auth.js';
import { loadGlobalGitHub, saveGlobalGitHub, clearGlobalGitHub } from '../../services/github-store.js';

export function GitHubProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [status, setStatus] = useState<GitHubContextValue['status']>('disconnected');
  const [user, setUser] = useState<GitHubIdentity | undefined>(undefined);
  const [deviceFlow, setDeviceFlow] = useState<GitHubContextValue['deviceFlow']>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [errorCategory, setErrorCategory] = useState<GitHubAuthErrorCategory | undefined>(undefined);
  const connectingRef = useRef(false);
  // Fix 2: cancellation — each connect() call captures an attempt number;
  // disconnect() and unmount increment the ref to invalidate in-flight attempts.
  const connectAttemptRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    // Fix 2: track mount/unmount for cancellation guard.
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rec = await loadGlobalGitHub();
      if (cancelled || !rec) return;
      setUser(rec.identity);
      setStatus('connected');
    })();
    return () => { cancelled = true; };
  }, []);

  const connect = useCallback(async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    // Fix 2: stamp this attempt so racing state mutations can be voided.
    const attempt = ++connectAttemptRef.current;
    setError(undefined);
    setErrorCategory(undefined);
    setStatus('connecting');
    const authBase = getGitHubAuthBase();
    try {
      const init = await initDeviceFlow(authBase);
      // Fix 2: bail if disconnected or superseded after await.
      if (!mountedRef.current || connectAttemptRef.current !== attempt) return;
      if (init.kind !== 'ok') {
        setStatus('error');
        setError(init.reason);
        setErrorCategory(init.category);
        return;
      }
      setDeviceFlow({ userCode: init.userCode, verificationUri: init.verificationUri });
      // Fix 3: GitHub device-flow spec requires a minimum 5 s poll interval.
      // intervalSec: 0 is only used in tests (via vi.useFakeTimers); clamp to
      // 5 s in all real calls. slow_down increments the working interval by 5 s.
      let intervalMs = Math.max((init.intervalSec ?? 5) * 1000, 5000);
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise((r) => setTimeout(r, intervalMs));
        // Fix 2: bail after the timer if invalidated.
        if (!mountedRef.current || connectAttemptRef.current !== attempt) return;
        const poll = await pollDeviceFlow(authBase, init.deviceCode);
        // Fix 2: bail after the poll if invalidated.
        if (!mountedRef.current || connectAttemptRef.current !== attempt) return;
        if (poll.kind === 'ok') {
          let identity: GitHubIdentity | undefined;
          const u = await fetchGitHubUser(authBase, poll.accessToken);
          // Fix 2: bail after user fetch if invalidated.
          if (!mountedRef.current || connectAttemptRef.current !== attempt) return;
          if (u.kind === 'ok') identity = { login: u.login, avatarUrl: u.avatarUrl };
          await saveGlobalGitHub(poll.accessToken, identity);
          if (!mountedRef.current || connectAttemptRef.current !== attempt) return;
          setUser(identity);
          setDeviceFlow(undefined);
          setStatus('connected');
          return;
        }
        if (poll.kind === 'pending') continue;
        // Fix 3: slow_down — increase the working interval per GitHub spec.
        if (poll.kind === 'slow_down') { intervalMs += 5000; continue; }
        // Terminal poll failures: 'error' carries a structured category;
        // 'expired'/'access_denied' are terminal but not Worker-categorised.
        setStatus('error');
        if (poll.kind === 'error') {
          setError(poll.reason);
          setErrorCategory(poll.category);
        } else {
          setError(poll.kind);
          setErrorCategory(undefined);
        }
        setDeviceFlow(undefined);
        return;
      }
    } catch (err) {
      // Fix 2: guard the catch block so a cancelled attempt doesn't stomp state.
      if (!mountedRef.current || connectAttemptRef.current !== attempt) return;
      setStatus('error'); setError((err as Error).message); setErrorCategory(undefined); setDeviceFlow(undefined);
    } finally {
      connectingRef.current = false;
    }
  }, []);

  const disconnect = useCallback(async () => {
    // Fix 2: invalidate any in-flight connect() so it won't re-connect after this.
    connectAttemptRef.current++;
    await clearGlobalGitHub();
    setUser(undefined); setDeviceFlow(undefined); setError(undefined); setErrorCategory(undefined); setStatus('disconnected');
  }, []);

  const value: GitHubContextValue = { status, user, deviceFlow, error, errorCategory, connect, disconnect };
  return <GitHubContext.Provider value={value}>{children}</GitHubContext.Provider>;
}
