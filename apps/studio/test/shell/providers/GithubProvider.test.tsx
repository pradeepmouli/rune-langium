// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

const store = { token: null as string | null, identity: undefined as any };
vi.mock('../../../src/services/github-store.js', () => ({
  loadGlobalGitHub: vi.fn(async () => (store.token ? { token: store.token, identity: store.identity } : null)),
  saveGlobalGitHub: vi.fn(async (t: string, id: any) => { store.token = t; store.identity = id; }),
  clearGlobalGitHub: vi.fn(async () => { store.token = null; store.identity = undefined; })
}));
vi.mock('../../../src/services/github-auth.js', () => ({
  initDeviceFlow: vi.fn(async () => ({ kind: 'ok', deviceCode: 'dc', userCode: 'WXYZ-1234', verificationUri: 'https://github.com/login/device', intervalSec: 0 })),
  pollDeviceFlow: vi.fn(async () => ({ kind: 'ok', accessToken: 'ghs_tok', scope: 'repo' })),
  fetchGitHubUser: vi.fn(async () => ({ kind: 'ok', login: 'octocat', avatarUrl: 'https://x/a.png' }))
}));

import { GitHubProvider } from '../../../src/shell/providers/GitHubProvider.js';
import { useGitHub } from '../../../src/shell/providers/github-context.js';
import * as githubStore from '../../../src/services/github-store.js';
import * as githubAuth from '../../../src/services/github-auth.js';

const loadGlobalGitHub = vi.mocked(githubStore.loadGlobalGitHub);
const saveGlobalGitHub = vi.mocked(githubStore.saveGlobalGitHub);
const clearGlobalGitHub = vi.mocked(githubStore.clearGlobalGitHub);
const initDeviceFlow = vi.mocked(githubAuth.initDeviceFlow);
const pollDeviceFlow = vi.mocked(githubAuth.pollDeviceFlow);
const fetchGitHubUser = vi.mocked(githubAuth.fetchGitHubUser);

function Probe() {
  const g = useGitHub();
  return <div>
    <span data-testid="status">{g.status}</span>
    <span data-testid="login">{g.user?.login ?? '-'}</span>
    <button onClick={() => void g.connect()}>connect</button>
    <button onClick={() => void g.disconnect()}>disconnect</button>
    <button onClick={() => g.cancelConnect()}>cancelConnect</button>
  </div>;
}

beforeEach(() => {
  store.token = null; store.identity = undefined;
  vi.clearAllMocks();
  // Fix 3: GitHubProvider now clamps intervalMs to >= 5000ms. Use fake timers
  // so the poll fires without real wall-clock delay.
  // shouldAdvanceTime: true so @testing-library/react's waitFor polling also works.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  loadGlobalGitHub.mockImplementation(async () => (store.token ? { token: store.token, identity: store.identity } : null));
  saveGlobalGitHub.mockImplementation(async (t: string, id: any) => { store.token = t; store.identity = id; });
  clearGlobalGitHub.mockImplementation(async () => { store.token = null; store.identity = undefined; });
  initDeviceFlow.mockResolvedValue({ kind: 'ok', deviceCode: 'dc', userCode: 'WXYZ-1234', verificationUri: 'https://github.com/login/device', intervalSec: 0 });
  pollDeviceFlow.mockResolvedValue({ kind: 'ok', accessToken: 'ghs_tok', scope: 'repo' });
  fetchGitHubUser.mockResolvedValue({ kind: 'ok', login: 'octocat', avatarUrl: 'https://x/a.png' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GitHubProvider', () => {
  it('hydrates disconnected when IDB empty', async () => {
    render(<GitHubProvider><Probe /></GitHubProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('disconnected'));
  });
  it('hydrates connected from IDB (token + identity, no network)', async () => {
    store.token = 'ghs_tok'; store.identity = { login: 'octocat', avatarUrl: 'https://x/a.png' };
    render(<GitHubProvider><Probe /></GitHubProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('connected'));
    expect(screen.getByTestId('login').textContent).toBe('octocat');
    expect(initDeviceFlow).not.toHaveBeenCalled();
  });
  it('connect() runs device flow, persists, fetches identity → connected', async () => {
    render(<GitHubProvider><Probe /></GitHubProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('disconnected'));
    screen.getByText('connect').click();
    // Advance past the clamped 5 s poll interval so the timer fires.
    await act(async () => { await vi.advanceTimersByTimeAsync(5001); });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('connected'));
    expect(screen.getByTestId('login').textContent).toBe('octocat');
    expect(store.token).toBe('ghs_tok');
  });
  it('IDB write failure during connect → still connected for the session (Fix B, spec §10)', async () => {
    // Privacy mode / IDB unavailable: the OAuth succeeded, so connect() must
    // complete (session-only, token unpersisted) rather than report an error.
    saveGlobalGitHub.mockRejectedValueOnce(new Error('IndexedDB unavailable'));
    render(<GitHubProvider><Probe /></GitHubProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('disconnected'));
    screen.getByText('connect').click();
    await act(async () => { await vi.advanceTimersByTimeAsync(5001); });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('connected'));
    expect(screen.getByTestId('login').textContent).toBe('octocat');
  });
  it('device-flow error → status error', async () => {
    initDeviceFlow.mockResolvedValue({ kind: 'error', reason: 'boom', category: 'unavailable' });
    render(<GitHubProvider><Probe /></GitHubProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('disconnected'));
    await act(async () => { screen.getByText('connect').click(); });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error'));
  });
  it('/user failure → connected without identity', async () => {
    fetchGitHubUser.mockResolvedValue({ kind: 'error', reason: 'x', category: 'misconfigured' });
    render(<GitHubProvider><Probe /></GitHubProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('disconnected'));
    screen.getByText('connect').click();
    // Advance past the clamped 5 s poll interval so the timer fires.
    await act(async () => { await vi.advanceTimersByTimeAsync(5001); });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('connected'));
    expect(screen.getByTestId('login').textContent).toBe('-');
  });
  it('disconnect() clears IDB → disconnected', async () => {
    store.token = 'ghs_tok'; store.identity = { login: 'octocat', avatarUrl: 'https://x/a.png' };
    render(<GitHubProvider><Probe /></GitHubProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('connected'));
    await act(async () => { screen.getByText('disconnect').click(); });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('disconnected'));
    expect(store.token).toBeNull();
  });
  it('useGitHub throws outside provider', () => {
    function Bare() { useGitHub(); return null; }
    expect(() => render(<Bare />)).toThrow(/within a GitHubProvider/);
  });
  it('cancelConnect() aborts the in-flight poll and returns to disconnected (Fix C)', async () => {
    // Poll always returns 'pending' so the loop never self-terminates.
    pollDeviceFlow.mockResolvedValue({ kind: 'pending' });
    render(<GitHubProvider><Probe /></GitHubProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('disconnected'));
    screen.getByText('connect').click();
    // Advance far enough for one poll interval to fire so we confirm 'connecting'.
    await act(async () => { await vi.advanceTimersByTimeAsync(5001); });
    // May still be connecting (pending poll); cancel now.
    screen.getByText('cancelConnect').click();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('disconnected'));
    // No further polls should fire after cancel.
    const pollCountAfterCancel = pollDeviceFlow.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(pollDeviceFlow.mock.calls.length).toBe(pollCountAfterCancel);
  });
  it('cancelConnect() is a no-op when already connected', async () => {
    store.token = 'ghs_tok'; store.identity = { login: 'octocat', avatarUrl: 'https://x/a.png' };
    render(<GitHubProvider><Probe /></GitHubProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('connected'));
    await act(async () => { screen.getByText('cancelConnect').click(); });
    // Status must remain connected — cancelConnect is a no-op when not connecting.
    expect(screen.getByTestId('status').textContent).toBe('connected');
  });
});
