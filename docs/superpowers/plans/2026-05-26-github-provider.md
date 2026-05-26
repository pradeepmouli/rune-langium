# GithubProvider — app-global GitHub identity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an app-global GitHub connection ("connect once, reuse across workspaces") backed by a `GithubProvider`, with a Settings entry point, identity display, and a global-token backstop in the git-sync auth path — while new git-backed workspaces keep writing a per-workspace token copy seeded from the global connection.

**Architecture:** A new app-global `GithubProvider` (sibling of `WorkspaceProvider` in `StudioProviders`) owns the device-flow lifecycle + connection state + cached identity, hydrating from a small IndexedDB store. The git-sync `onAuth` resolves the per-workspace OPFS token first, else the global IDB token. Identity (`@login`/avatar) comes from a new `/user` proxy on the github-auth worker. `GitHubConnectDialog` becomes a thin view of provider state; `SettingsPerspective` gains a GitHub section; `FileLoader`/`createGitBacked` seed the per-workspace copy from the global connection.

**Tech Stack:** React 19, `idb`, TypeScript 5.9 ESM, Vitest 4, @testing-library/react, Cloudflare Worker (github-auth-worker). Spec: `docs/superpowers/specs/2026-05-26-github-provider-design.md`.

---

## How to read this plan

**New-unit tasks** (the IDB store, context/provider, worker endpoint) carry full code. **Integration tasks** (git-sync `onAuth`, StudioProviders mount, dialog refactor, Settings section, FileLoader/createGitBacked) carry the exact seam + resulting snippet + a "read first" note, and must be **behavior-preserving** for existing per-workspace-token workspaces. Run the full studio suite (`pnpm --filter @rune-langium/studio test`, ~9s) after each integration task — not a subset. SPDX header on every new file: `// SPDX-License-Identifier: FSL-1.1-ALv2` then `// Copyright (c) 2026 Pradeep Mouli`. Commits use `SKIP_SIMPLE_GIT_HOOKS=1` (not `--no-verify`). Branch `feat/github-provider` is already created off master.

**Anchors confirmed (current code):**
- `services/github-auth.ts`: `initDeviceFlow(authBase): Promise<InitResult>`, `pollDeviceFlow(authBase, deviceCode): Promise<PollResult>`, `loadWorkspaceToken(fs, workspaceId)`, `storeWorkspaceToken(fs, workspaceId, token)`. `InitResult.ok = {kind:'ok', deviceCode, userCode, verificationUri, intervalSec}`. `PollResult` = `ok{accessToken,scope}` | `pending` | `slow_down` | `expired` | `access_denied` | `error{reason,category}`.
- `services/git-sync.ts:101-103`: `onAuth: async () => ({ username: …, password: (await loadWorkspaceToken(fs, workspaceId)) ?? '' })`.
- Studio uses the `idb` library; `services/model-cache.ts` is a precedent for a standalone IDB DB (separate from `workspace/persistence.ts`'s `RuneStudioDB`).
- `apps/github-auth-worker/src/index.ts`: routes `POST /rune-studio/api/github-auth/device-init`, `/device-poll`.
- `components/GitHubConnectDialog.tsx`: local `useState<DialogState>` (`phase: init|pending|expired|access_denied|error`), polls in an effect; has a `Props` interface (line ~45) with a success callback.

---

## File structure

**Create:**
- `apps/studio/src/services/github-store.ts` — standalone IDB store for the global connection (token + identity).
- `apps/studio/src/shell/providers/github-context.ts` — `GithubContextValue`, `GithubContext`, `useGithub()`.
- `apps/studio/src/shell/providers/GithubProvider.tsx` — hydrate / connect / disconnect; owns the device-flow.
- `apps/studio/src/services/github-authbase.ts` — the extracted `getGithubAuthBase()` helper (deduped from FileLoader/dialog).
- Test files mirroring each, under `apps/studio/test/...`.

**Modify:**
- `apps/github-auth-worker/src/index.ts` — add `POST /rune-studio/api/github-auth/user`.
- `apps/studio/src/services/github-auth.ts` — add `fetchGitHubUser(authBase, token)`.
- `apps/studio/src/services/git-sync.ts` — `onAuth` global-token backstop.
- `apps/studio/src/shell/providers/StudioProviders.tsx` — mount `<GithubProvider>` (sibling of WorkspaceProvider).
- `apps/studio/src/components/GitHubConnectDialog.tsx` — render `useGithub()` state.
- `apps/studio/src/shell/perspectives/screens/SettingsPerspective.tsx` — GitHub section.
- `apps/studio/src/components/FileLoader.tsx` + `apps/studio/src/workspace/workspace-manager.ts` — seed per-workspace token from the global connection.

---

## Task 1: `github-store` (IndexedDB global connection store)

**Files:**
- Create: `apps/studio/src/services/github-store.ts`
- Test: `apps/studio/test/services/github-store.test.ts`

- [ ] **Step 1: Write the failing test** (uses `fake-indexeddb`, as other studio IDB tests do)

```ts
// apps/studio/test/services/github-store.test.ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  saveGlobalGithub, loadGlobalGithub, loadGlobalGithubToken, clearGlobalGithub, _resetGithubStoreForTests
} from '../../src/services/github-store.js';

beforeEach(async () => {
  await _resetGithubStoreForTests();
  await new Promise<void>((r) => { const req = indexedDB.deleteDatabase('rune-studio-github'); req.onsuccess = req.onerror = req.onblocked = () => r(); });
});

describe('github-store', () => {
  it('returns null when nothing is stored', async () => {
    expect(await loadGlobalGithub()).toBeNull();
    expect(await loadGlobalGithubToken()).toBeNull();
  });
  it('round-trips token + identity', async () => {
    await saveGlobalGithub('ghs_tok', { login: 'octocat', avatarUrl: 'https://x/y.png' });
    expect(await loadGlobalGithub()).toEqual({ token: 'ghs_tok', identity: { login: 'octocat', avatarUrl: 'https://x/y.png' } });
    expect(await loadGlobalGithubToken()).toBe('ghs_tok');
  });
  it('clears the connection', async () => {
    await saveGlobalGithub('ghs_tok', { login: 'octocat', avatarUrl: 'https://x/y.png' });
    await clearGlobalGithub();
    expect(await loadGlobalGithub()).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL (module not found).** `pnpm --filter @rune-langium/studio exec vitest run test/services/github-store.test.ts`

- [ ] **Step 3: Implement the store** (standalone DB, mirrors `services/model-cache.ts`'s `idb` usage)

```ts
// apps/studio/src/services/github-store.ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { openDB, type IDBPDatabase } from 'idb';

export interface GithubIdentity { login: string; avatarUrl: string; }
interface GlobalGithubRecord { token: string; identity?: GithubIdentity; }

const DB_NAME = 'rune-studio-github';
const DB_VERSION = 1;
const STORE = 'connection';
const KEY = 'global';

let dbPromise: Promise<IDBPDatabase> | null = null;
function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
      }
    });
  }
  return dbPromise;
}

export async function saveGlobalGithub(token: string, identity?: GithubIdentity): Promise<void> {
  const record: GlobalGithubRecord = { token, ...(identity ? { identity } : {}) };
  await (await db()).put(STORE, record, KEY);
}
export async function loadGlobalGithub(): Promise<GlobalGithubRecord | null> {
  return (await (await db()).get(STORE, KEY)) ?? null;
}
export async function loadGlobalGithubToken(): Promise<string | null> {
  return (await loadGlobalGithub())?.token ?? null;
}
export async function clearGlobalGithub(): Promise<void> {
  await (await db()).delete(STORE, KEY);
}
/** Test-only: drop the cached connection so a fresh DB handle is opened. */
export async function _resetGithubStoreForTests(): Promise<void> {
  if (dbPromise) { (await dbPromise).close(); dbPromise = null; }
}
```

> Confirm `idb`'s `openDB` import shape matches `services/model-cache.ts` (it does — same library). If the repo wraps `idb` behind a helper, follow that pattern instead.

- [ ] **Step 4: Run it — expect PASS (3 tests).** Same command as Step 2.

- [ ] **Step 5: Commit**
```bash
git add apps/studio/src/services/github-store.ts apps/studio/test/services/github-store.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(studio): github-store — IDB store for the app-global GitHub connection"
```

---

## Task 2: Worker `/user` endpoint + `fetchGitHubUser` client

**Files:**
- Modify: `apps/github-auth-worker/src/index.ts`
- Modify: `apps/studio/src/services/github-auth.ts`
- Test: `apps/github-auth-worker/test/user.test.ts`, plus a `fetchGitHubUser` unit in `apps/studio/test/services/github-auth-user.test.ts`
- Read first: `apps/github-auth-worker/src/index.ts` (how `/device-init` + `/device-poll` are routed, how GitHub is called, how errors map to categories, CORS/origin handling) and `services/github-auth.ts` (the `GitHubAuthErrorCategory` union + how init/poll build requests).

- [ ] **Step 1: Write the failing worker test** (mirror the existing device-flow worker tests' harness — `apps/github-auth-worker/test/device-flow.test.ts`)

```ts
// apps/github-auth-worker/test/user.test.ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/index.js';
// Reuse the same env + fetch-mock pattern device-flow.test.ts uses (copy its makeEnv + global fetch stub).

beforeEach(() => { vi.restoreAllMocks(); });

function req(token: string) {
  return new Request('https://x/rune-studio/api/github-auth/user', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: 'https://www.daikonic.dev' }
  });
}

describe('POST /rune-studio/api/github-auth/user', () => {
  it('returns {login, avatarUrl} on GitHub 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ login: 'octocat', avatar_url: 'https://x/a.png' }), { status: 200 })));
    const res = await worker.fetch(req('ghs_tok'), /* makeEnv() */);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ login: 'octocat', avatarUrl: 'https://x/a.png' });
  });
  it('maps GitHub 401 to a structured misconfigured/unauthorised error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    const res = await worker.fetch(req('bad'), /* makeEnv() */);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
```

> Copy the exact `makeEnv()` / origin-allow harness from `device-flow.test.ts`; match its error-category mapping + status codes. Keep the route's CORS/origin checks identical to the other endpoints.

- [ ] **Step 2: Run it — expect FAIL (route 404 / not implemented).** `pnpm --filter @rune-langium/github-auth-worker exec vitest run test/user.test.ts`

- [ ] **Step 3: Add the `/user` route to the worker.** In `apps/github-auth-worker/src/index.ts`, alongside the `/device-init` + `/device-poll` handlers, add a `POST /rune-studio/api/github-auth/user` handler that: applies the same origin/CORS guard; reads the `Authorization` header token; calls `GET https://api.github.com/user` with `Authorization: Bearer <token>` + `User-Agent` + `Accept: application/vnd.github+json`; on 200 returns `{ login, avatarUrl: avatar_url }`; on 401/403/4xx/5xx maps to the same structured error shape (`{ error: <category> }`) + status the other routes use. **Never log the token.** Match the existing handlers' structure exactly (read them first).

- [ ] **Step 4: Run the worker test — expect PASS.** Same command as Step 2.

- [ ] **Step 5: Add `fetchGitHubUser` client + its test.**

```ts
// add to apps/studio/src/services/github-auth.ts
export type UserResult =
  | { kind: 'ok'; login: string; avatarUrl: string }
  | { kind: 'error'; reason: string; category: GitHubAuthErrorCategory };

export async function fetchGitHubUser(authBase: string, token: string): Promise<UserResult> {
  let res: Response;
  try {
    res = await fetch(`${authBase}/user`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    return { kind: 'error', reason: (err as Error).message, category: 'unavailable' };
  }
  if (res.ok) {
    const body = (await res.json()) as { login: string; avatarUrl: string };
    return { kind: 'ok', login: body.login, avatarUrl: body.avatarUrl };
  }
  return { kind: 'error', reason: `user fetch failed (${res.status})`, category: 'misconfigured' };
}
```

```ts
// apps/studio/test/services/github-auth-user.test.ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, vi } from 'vitest';
import { fetchGitHubUser } from '../../src/services/github-auth.js';
describe('fetchGitHubUser', () => {
  it('returns ok identity on 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ login: 'octocat', avatarUrl: 'https://x/a.png' }), { status: 200 })));
    expect(await fetchGitHubUser('/api/github-auth', 't')).toEqual({ kind: 'ok', login: 'octocat', avatarUrl: 'https://x/a.png' });
  });
  it('returns error on non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    expect((await fetchGitHubUser('/api/github-auth', 't')).kind).toBe('error');
  });
});
```

> Confirm `GitHubAuthErrorCategory` includes `'unavailable'` + `'misconfigured'` (it does — used by init/poll). Reuse, don't invent categories.

- [ ] **Step 6: Run both new tests — expect PASS.** `pnpm --filter @rune-langium/github-auth-worker exec vitest run test/user.test.ts` and `pnpm --filter @rune-langium/studio exec vitest run test/services/github-auth-user.test.ts`

- [ ] **Step 7: Commit**
```bash
git add apps/github-auth-worker/src/index.ts apps/github-auth-worker/test/user.test.ts apps/studio/src/services/github-auth.ts apps/studio/test/services/github-auth-user.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(github-auth-worker): /user identity proxy + fetchGitHubUser client"
```

---

## Task 3: `github-context` + `GithubProvider`

**Files:**
- Create: `apps/studio/src/services/github-authbase.ts`, `apps/studio/src/shell/providers/github-context.ts`, `apps/studio/src/shell/providers/GithubProvider.tsx`
- Test: `apps/studio/test/shell/providers/GithubProvider.test.tsx`
- Read first: `components/FileLoader.tsx` + `GitHubConnectDialog.tsx` for the exact `authBase` expression (`${origin}/rune-studio/api/github-auth`) to extract.

- [ ] **Step 1: Extract the authBase helper**

```ts
// apps/studio/src/services/github-authbase.ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
/** Base URL for the github-auth worker routes (device-init / device-poll / user). */
export function getGithubAuthBase(): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/rune-studio/api/github-auth`;
}
```
> Match the EXACT path the current code uses (read FileLoader/dialog — confirm it's `/rune-studio/api/github-auth`). Replace the inline computations in FileLoader + GitHubConnectDialog with this helper in Task 6 (not now, to keep this task additive).

- [ ] **Step 2: Write the failing provider test**

```tsx
// apps/studio/test/shell/providers/GithubProvider.test.tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

const store = { token: null as string | null, identity: undefined as any };
vi.mock('../../../src/services/github-store.js', () => ({
  loadGlobalGithub: vi.fn(async () => (store.token ? { token: store.token, identity: store.identity } : null)),
  saveGlobalGithub: vi.fn(async (t: string, id: any) => { store.token = t; store.identity = id; }),
  clearGlobalGithub: vi.fn(async () => { store.token = null; store.identity = undefined; })
}));
const initDeviceFlow = vi.fn(async () => ({ kind: 'ok', deviceCode: 'dc', userCode: 'WXYZ-1234', verificationUri: 'https://github.com/login/device', intervalSec: 0 }));
const pollDeviceFlow = vi.fn(async () => ({ kind: 'ok', accessToken: 'ghs_tok', scope: 'repo' }));
const fetchGitHubUser = vi.fn(async () => ({ kind: 'ok', login: 'octocat', avatarUrl: 'https://x/a.png' }));
vi.mock('../../../src/services/github-auth.js', () => ({ initDeviceFlow, pollDeviceFlow, fetchGitHubUser }));

import { GithubProvider } from '../../../src/shell/providers/GithubProvider.js';
import { useGithub } from '../../../src/shell/providers/github-context.js';

function Probe() {
  const g = useGithub();
  return <div>
    <span data-testid="status">{g.status}</span>
    <span data-testid="login">{g.user?.login ?? '-'}</span>
    <button onClick={() => void g.connect()}>connect</button>
    <button onClick={() => void g.disconnect()}>disconnect</button>
  </div>;
}

beforeEach(() => { store.token = null; store.identity = undefined; vi.clearAllMocks();
  initDeviceFlow.mockResolvedValue({ kind: 'ok', deviceCode: 'dc', userCode: 'WXYZ-1234', verificationUri: 'https://github.com/login/device', intervalSec: 0 });
  pollDeviceFlow.mockResolvedValue({ kind: 'ok', accessToken: 'ghs_tok', scope: 'repo' });
  fetchGitHubUser.mockResolvedValue({ kind: 'ok', login: 'octocat', avatarUrl: 'https://x/a.png' });
});

describe('GithubProvider', () => {
  it('hydrates disconnected when IDB empty', async () => {
    render(<GithubProvider><Probe /></GithubProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('disconnected'));
  });
  it('hydrates connected from IDB (token + identity, no network)', async () => {
    store.token = 'ghs_tok'; store.identity = { login: 'octocat', avatarUrl: 'https://x/a.png' };
    render(<GithubProvider><Probe /></GithubProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('connected'));
    expect(screen.getByTestId('login').textContent).toBe('octocat');
    expect(initDeviceFlow).not.toHaveBeenCalled();
  });
  it('connect() runs device flow, persists, fetches identity → connected', async () => {
    render(<GithubProvider><Probe /></GithubProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('disconnected'));
    await act(async () => { screen.getByText('connect').click(); });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('connected'));
    expect(screen.getByTestId('login').textContent).toBe('octocat');
    expect(store.token).toBe('ghs_tok');
  });
  it('device-flow error → status error', async () => {
    initDeviceFlow.mockResolvedValue({ kind: 'error', reason: 'boom', category: 'unavailable' });
    render(<GithubProvider><Probe /></GithubProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('disconnected'));
    await act(async () => { screen.getByText('connect').click(); });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error'));
  });
  it('/user failure → connected without identity', async () => {
    fetchGitHubUser.mockResolvedValue({ kind: 'error', reason: 'x', category: 'misconfigured' });
    render(<GithubProvider><Probe /></GithubProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('disconnected'));
    await act(async () => { screen.getByText('connect').click(); });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('connected'));
    expect(screen.getByTestId('login').textContent).toBe('-');
  });
  it('disconnect() clears IDB → disconnected', async () => {
    store.token = 'ghs_tok'; store.identity = { login: 'octocat', avatarUrl: 'https://x/a.png' };
    render(<GithubProvider><Probe /></GithubProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('connected'));
    await act(async () => { screen.getByText('disconnect').click(); });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('disconnected'));
    expect(store.token).toBeNull();
  });
  it('useGithub throws outside provider', () => {
    function Bare() { useGithub(); return null; }
    expect(() => render(<Bare />)).toThrow(/within a GithubProvider/);
  });
});
```

- [ ] **Step 3: Run it — expect FAIL.** `pnpm --filter @rune-langium/studio exec vitest run test/shell/providers/GithubProvider.test.tsx`

- [ ] **Step 4: Implement the context**

```ts
// apps/studio/src/shell/providers/github-context.ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { createContext, useContext } from 'react';
import type { GithubIdentity } from '../../services/github-store.js';

export type { GithubIdentity };
export interface GithubContextValue {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  user?: GithubIdentity;
  deviceFlow?: { userCode: string; verificationUri: string };
  error?: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
export const GithubContext = createContext<GithubContextValue | null>(null);
export function useGithub(): GithubContextValue {
  const ctx = useContext(GithubContext);
  if (ctx === null) throw new Error('useGithub must be used within a GithubProvider');
  return ctx;
}
```

- [ ] **Step 5: Implement the provider**

```tsx
// apps/studio/src/shell/providers/GithubProvider.tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GithubContext, type GithubContextValue, type GithubIdentity } from './github-context.js';
import { getGithubAuthBase } from '../../services/github-authbase.js';
import { initDeviceFlow, pollDeviceFlow, fetchGitHubUser } from '../../services/github-auth.js';
import { loadGlobalGithub, saveGlobalGithub, clearGlobalGithub } from '../../services/github-store.js';

const POLL_FALLBACK_MS = 5000;

export function GithubProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [status, setStatus] = useState<GithubContextValue['status']>('disconnected');
  const [user, setUser] = useState<GithubIdentity | undefined>(undefined);
  const [deviceFlow, setDeviceFlow] = useState<GithubContextValue['deviceFlow']>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const connectingRef = useRef(false);

  // Hydrate from IDB once on mount — no network if a token is cached.
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
      const intervalMs = (init.intervalSec || 5) * 1000 || POLL_FALLBACK_MS;
      // Poll until terminal.
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
        // expired | access_denied | error → terminal failure
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
```

> The test sets `intervalSec: 0` so polling is immediate. Keep the `connectingRef` guard so a double-click doesn't start two flows. Do not add retry/backoff beyond `slow_down`-continue (YAGNI).

- [ ] **Step 6: Run the test — expect PASS (7 cases).** Same command as Step 3.

- [ ] **Step 7: Commit**
```bash
git add apps/studio/src/services/github-authbase.ts apps/studio/src/shell/providers/github-context.ts apps/studio/src/shell/providers/GithubProvider.tsx apps/studio/test/shell/providers/GithubProvider.test.tsx
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(studio): GithubProvider + useGithub — app-global connection lifecycle"
```

---

## Task 4: Mount `GithubProvider` in `StudioProviders`

**Files:** Modify `apps/studio/src/shell/providers/StudioProviders.tsx`; Test: extend `apps/studio/test/shell/providers/StudioProviders.test.tsx`.

- [ ] **Step 1: Add a failing assertion** to the existing StudioProviders test — a probe calling `useGithub()` inside `<StudioProviders>` resolves (mock github-store/auth + the existing lsp/transport/worker mocks). Assert `useGithub().status` is defined.

- [ ] **Step 2: Run it — expect FAIL (no GithubProvider in tree).**

- [ ] **Step 3: Mount it as a SIBLING of WorkspaceProvider.** GithubProvider does not consume `useWorkspace`, so it wraps *outside* WorkspaceProvider (app-global tier):

```tsx
// StudioProviders.tsx
export function StudioProviders({ state, actions, children }: Props): React.ReactElement {
  return (
    <GithubProvider>
      <WorkspaceProvider state={state} actions={actions}>
        <LspProvider>
          <CodegenProvider>{children}</CodegenProvider>
        </LspProvider>
      </WorkspaceProvider>
    </GithubProvider>
  );
}
```
Add the import; update the reserved-slot comment to note GithubProvider is now implemented (leave Settings/Curated reserved). (Wrapping outside Workspace is fine — Github is app-global and Workspace/Lsp/Codegen don't consume `useGithub`. The "sibling" intent of §3 is satisfied: no nesting dependency in either direction; placement outside is the app-global tier.)

- [ ] **Step 4: Run the full studio suite — expect PASS** (mounting Github in App tests now hydrates from the github-store; ensure App-mount tests either mock `github-store` or tolerate the empty-IDB `disconnected` path — it makes no network call, so it should be inert). `pnpm --filter @rune-langium/studio test` → all green (fix any App test that needs the github-store mocked).

- [ ] **Step 5: Commit**
```bash
git add apps/studio/src/shell/providers/StudioProviders.tsx apps/studio/test/shell/providers/StudioProviders.test.tsx
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(studio): mount GithubProvider (app-global tier) in StudioProviders"
```

---

## Task 5: git-sync `onAuth` global-token backstop

**Files:** Modify `apps/studio/src/services/git-sync.ts`; Test: `apps/studio/test/services/git-sync-auth.test.ts` (or extend existing git-sync tests).
- Read first: `git-sync.ts:95-110` — the `onAuth` callback shape + the `username` value used.

- [ ] **Step 1: Write the failing test** — assert resolution order (mock `loadWorkspaceToken` + `loadGlobalGithubToken`).

```ts
// apps/studio/test/services/git-sync-auth.test.ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, vi, beforeEach } from 'vitest';
const loadWorkspaceToken = vi.fn();
const loadGlobalGithubToken = vi.fn();
vi.mock('../../src/services/github-auth.js', () => ({ loadWorkspaceToken }));
vi.mock('../../src/services/github-store.js', () => ({ loadGlobalGithubToken }));
// Import the onAuth resolver. If it's not separately exported, add an exported
// `resolveGitToken(fs, workspaceId)` helper in git-sync.ts and have onAuth call it.
import { resolveGitToken } from '../../src/services/git-sync.js';

beforeEach(() => { vi.clearAllMocks(); });

describe('git-sync token resolution', () => {
  it('uses the per-workspace token when present', async () => {
    loadWorkspaceToken.mockResolvedValue('ws-tok'); loadGlobalGithubToken.mockResolvedValue('global-tok');
    expect(await resolveGitToken({} as any, 'w1')).toBe('ws-tok');
    expect(loadGlobalGithubToken).not.toHaveBeenCalled();
  });
  it('falls back to the global token when no per-workspace token', async () => {
    loadWorkspaceToken.mockResolvedValue(null); loadGlobalGithubToken.mockResolvedValue('global-tok');
    expect(await resolveGitToken({} as any, 'w1')).toBe('global-tok');
  });
  it('returns empty string when neither exists', async () => {
    loadWorkspaceToken.mockResolvedValue(null); loadGlobalGithubToken.mockResolvedValue(null);
    expect(await resolveGitToken({} as any, 'w1')).toBe('');
  });
});
```

- [ ] **Step 2: Run it — expect FAIL (no `resolveGitToken` export).**

- [ ] **Step 3: Implement.** In `git-sync.ts`, extract the token resolution into an exported helper and call it from `onAuth`:

```ts
import { loadWorkspaceToken } from './github-auth.js';
import { loadGlobalGithubToken } from './github-store.js';

export async function resolveGitToken(fs: OpfsFs, workspaceId: string): Promise<string> {
  return (await loadWorkspaceToken(fs, workspaceId)) ?? (await loadGlobalGithubToken()) ?? '';
}
```
Then in the engine config: `onAuth: async () => ({ username: <unchanged>, password: await resolveGitToken(fs, workspaceId) })`. (Use the exact `username` value/type the current code uses — read it.)

- [ ] **Step 4: Run the new test + full git-sync suite — expect PASS.** `pnpm --filter @rune-langium/studio exec vitest run test/services/git-sync-auth.test.ts` then `pnpm --filter @rune-langium/studio test`.

- [ ] **Step 5: Commit**
```bash
git add apps/studio/src/services/git-sync.ts apps/studio/test/services/git-sync-auth.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(studio): git-sync onAuth falls back to the global GitHub token (per-workspace first)"
```

---

## Task 6: `GitHubConnectDialog` → render provider state + dedupe authBase

**Files:** Modify `apps/studio/src/components/GitHubConnectDialog.tsx`, `apps/studio/src/components/FileLoader.tsx`; Test: update `apps/studio/test/components/FileLoader-github.test.tsx`.
- Read first: the full `GitHubConnectDialog.tsx` (its `Props`, the local `DialogState`, the success callback it invokes) and FileLoader's use of it + the inline `authBase`.

- [ ] **Step 1:** Replace the inline `authBase` computations in `FileLoader` + `GitHubConnectDialog` with `getGithubAuthBase()` (from Task 3). Behavior-preserving.

- [ ] **Step 2:** Refactor `GitHubConnectDialog` to render from `useGithub()` (`status`/`deviceFlow`/`error`) instead of owning its own `initDeviceFlow`/`pollDeviceFlow` loop: on open, call `useGithub().connect()`; map `status` → the existing phase UI (`connecting`+`deviceFlow` → show the user code + verification link; `error` → existing English copy; `connected` → invoke the dialog's existing success callback / close). Keep the existing rendered copy/markup; only swap the *source* of state. Preserve the dialog's `Props` contract (the success callback still fires).

> If the existing dialog test asserts the internal init/poll calls, update it to drive `useGithub()` (wrap the render in a `GithubContext.Provider` with a fake value, or mock the provider). Keep the user-visible assertions (code shown, error copy) intact.

- [ ] **Step 3: Run the updated FileLoader/dialog tests + full suite — expect PASS.** `pnpm --filter @rune-langium/studio test`.

- [ ] **Step 4: Commit**
```bash
git add apps/studio/src/components/GitHubConnectDialog.tsx apps/studio/src/components/FileLoader.tsx apps/studio/test/components/FileLoader-github.test.tsx
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "refactor(studio): GitHubConnectDialog renders GithubProvider state; dedupe authBase helper"
```

---

## Task 7: `SettingsPerspective` GitHub section

**Files:** Modify `apps/studio/src/shell/perspectives/screens/SettingsPerspective.tsx`; Test: `apps/studio/test/shell/SettingsPerspective-github.test.tsx`.
- Read first: `SettingsPerspective.tsx` (its current section structure — FontScaleButton + the forward-looking Project section) to match layout/markup conventions.

- [ ] **Step 1: Write the failing test** — render `SettingsPerspective` wrapped in a `GithubContext.Provider` with a fake value; assert: disconnected → "Connect GitHub" button calls `connect`; connected → shows `@login` + a Disconnect button that calls `disconnect`; error → shows the message.

```tsx
// apps/studio/test/shell/SettingsPerspective-github.test.tsx (sketch — fill real selectors from the impl)
// Render <GithubContext.Provider value={fake}><SettingsPerspective/></GithubContext.Provider>
// fake = { status:'connected', user:{login:'octocat',avatarUrl:'…'}, connect, disconnect }
// expect: getByText('octocat') present; click Disconnect → disconnect called.
// re-render with status:'disconnected' → getByRole('button', {name:/connect github/i}); click → connect called.
```

- [ ] **Step 2: Run it — expect FAIL.**

- [ ] **Step 3: Add the GitHub section** to `SettingsPerspective` consuming `useGithub()`: disconnected → Connect button (`onClick={() => void connect()}`); connecting → show `deviceFlow.userCode` + verification link (or a spinner); connected → avatar + `@{login}` + Disconnect button; error → the message + retry. Follow the existing section markup/styling in the file.

- [ ] **Step 4: Run the test + full suite — expect PASS.** `pnpm --filter @rune-langium/studio test`.

- [ ] **Step 5: Commit**
```bash
git add apps/studio/src/shell/perspectives/screens/SettingsPerspective.tsx apps/studio/test/shell/SettingsPerspective-github.test.tsx
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(studio): Settings GitHub account section (connect/disconnect + identity)"
```

---

## Task 8: Seed the per-workspace token from the global connection

**Files:** Modify `apps/studio/src/components/FileLoader.tsx` (git-backed creation flow) + `apps/studio/src/workspace/workspace-manager.ts` (`createGitBacked`); Test: extend the git-backed creation test.
- Read first: `workspace-manager.ts` `createGitBacked` (where it calls `storeWorkspaceToken`) and FileLoader's GitHub-create flow (how it obtains the token today + calls `createGitBackedWorkspace`).

**Design:** When the user creates a git-backed workspace while `useGithub().status === 'connected'`, source the token from the global connection (skip the device-flow prompt) and still write the per-workspace OPFS copy (status quo). When not connected, run `connect()` first, then seed from the result.

- [ ] **Step 1: Write/extend the failing test** — git-backed creation with a connected global GitHub: assert `createGitBacked` is called with the global token and `storeWorkspaceToken` writes the per-workspace copy (spy), and the device-flow dialog is NOT invoked.

- [ ] **Step 2: Run it — expect FAIL.**

- [ ] **Step 3: Implement.** In FileLoader's GitHub-create flow: if connected, read the global token (via a small accessor — `loadGlobalGithubToken()` or a value exposed by `useGithub()`; prefer adding the token to neither the context value (keep token out of React state) — instead call `loadGlobalGithubToken()` at creation time) and pass it into the existing `createGitBackedWorkspace({…, token})` path; `createGitBacked` continues to `storeWorkspaceToken` the per-workspace copy unchanged. If not connected, trigger `connect()`, await `connected`, then proceed.

> Keep the token OUT of the React context value (the provider exposes status/identity, not the raw token) — read it from the store at the moment of creation. This avoids holding the token in component state.

- [ ] **Step 4: Run the test + full suite — expect PASS.** `pnpm --filter @rune-langium/studio test`.

- [ ] **Step 5: Commit**
```bash
git add apps/studio/src/components/FileLoader.tsx apps/studio/src/workspace/workspace-manager.ts apps/studio/test/...
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(studio): seed per-workspace git token from the global connection (skip re-auth)"
```

---

## Task 9: Final verification

- [ ] **Step 1: Full studio suite** — `pnpm --filter @rune-langium/studio test` → green.
- [ ] **Step 2: Worker suite** — `pnpm --filter @rune-langium/github-auth-worker test` → green.
- [ ] **Step 3: Type-check** — `pnpm --filter @rune-langium/studio run type-check` and `pnpm --filter @rune-langium/github-auth-worker exec tsgo --noEmit` → clean.
- [ ] **Step 4: Lint** — `pnpm run lint` → no new errors in touched files.
- [ ] **Step 5: Manual smoke (document)** — connect from Settings (device code shown → authorize → identity appears); create a git-backed workspace (no re-auth prompt); disconnect (existing per-workspace workspace still works); reload (stays connected from IDB).

---

## Self-review (against the spec)

- §3 token model (seed + backstop) → Tasks 5 (backstop) + 8 (seed). ✓
- §5 `GithubProvider`/`useGithub` (hydrate/connect/disconnect, device-flow ownership) → Task 3. ✓
- §6 IDB store → Task 1. ✓
- §7 worker `/user` + `fetchGitHubUser` → Task 2. ✓
- §8 UI (Settings section, dialog refactor, FileLoader reuse) → Tasks 6, 7, 8. ✓
- §4 `onAuth` per-workspace-first-else-global → Task 5. ✓
- §9 composition (sibling mount) → Task 4. ✓
- §10/§11 edge cases + tests → covered across the per-task tests (hydrate, error, /user-fail, disconnect, resolution order, seed-not-prompt).
- **Type consistency:** `GithubIdentity` defined in `github-store.ts` (Task 1), re-exported via `github-context.ts` (Task 3); `UserResult`/`fetchGitHubUser` (Task 2) consumed by the provider (Task 3); `resolveGitToken` (Task 5) used by `onAuth`. Names consistent across tasks.
- **Read-first notes** on every integration task (2,5,6,7,8) because exact surrounding code (worker harness, dialog Props, createGitBacked, SettingsPerspective markup) must be matched, not guessed.
- **Ordering:** store (1) → worker+client (2) → provider (3) → mount (4) → onAuth (5) → dialog (6) → settings (7) → seed (8) → verify (9). Each task leaves the suite green; the provider is mountable (4) before consumers (6–8) depend on it.
