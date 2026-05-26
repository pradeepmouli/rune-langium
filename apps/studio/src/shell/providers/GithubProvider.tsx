// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GithubContext, type GithubContextValue, type GithubIdentity } from './github-context.js';
import { getGithubAuthBase } from '../../services/github-authbase.js';
import { initDeviceFlow, pollDeviceFlow, fetchGitHubUser } from '../../services/github-auth.js';
import { loadGlobalGithub, saveGlobalGithub, clearGlobalGithub } from '../../services/github-store.js';

export function GithubProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [status, setStatus] = useState<GithubContextValue['status']>('disconnected');
  const [user, setUser] = useState<GithubIdentity | undefined>(undefined);
  const [deviceFlow, setDeviceFlow] = useState<GithubContextValue['deviceFlow']>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const connectingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rec = await loadGlobalGithub();
      if (cancelled || !rec) return;
      setUser(rec.identity);
      setStatus('connected');
    })();
    return () => { cancelled = true; };
  }, []);

  const connect = useCallback(async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setError(undefined);
    setStatus('connecting');
    const authBase = getGithubAuthBase();
    try {
      const init = await initDeviceFlow(authBase);
      if (init.kind !== 'ok') { setStatus('error'); setError(init.reason); return; }
      setDeviceFlow({ userCode: init.userCode, verificationUri: init.verificationUri });
      // Use ?? so that intervalSec: 0 (test value) means immediate poll, not 5 s fallback.
      const intervalMs = (init.intervalSec ?? 5) * 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise((r) => setTimeout(r, intervalMs));
        const poll = await pollDeviceFlow(authBase, init.deviceCode);
        if (poll.kind === 'ok') {
          let identity: GithubIdentity | undefined;
          const u = await fetchGitHubUser(authBase, poll.accessToken);
          if (u.kind === 'ok') identity = { login: u.login, avatarUrl: u.avatarUrl };
          await saveGlobalGithub(poll.accessToken, identity);
          setUser(identity);
          setDeviceFlow(undefined);
          setStatus('connected');
          return;
        }
        if (poll.kind === 'pending' || poll.kind === 'slow_down') continue;
        setStatus('error');
        setError(poll.kind === 'error' ? poll.reason : poll.kind);
        setDeviceFlow(undefined);
        return;
      }
    } catch (err) {
      setStatus('error'); setError((err as Error).message); setDeviceFlow(undefined);
    } finally {
      connectingRef.current = false;
    }
  }, []);

  const disconnect = useCallback(async () => {
    await clearGlobalGithub();
    setUser(undefined); setDeviceFlow(undefined); setError(undefined); setStatus('disconnected');
  }, []);

  const value: GithubContextValue = { status, user, deviceFlow, error, connect, disconnect };
  return <GithubContext.Provider value={value}>{children}</GithubContext.Provider>;
}
