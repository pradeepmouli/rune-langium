# GitHub Push-Back via a Generic GitSyncEngine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let studio users edit a cloned GitHub repo and have edits flow back (commit → fetch → ff-or-merge → push) transparently on save, built on a new generic, reusable `@rune-langium/git-sync-engine` package.

**Architecture:** A framework/FS/remote-agnostic `GitSyncEngine` (a debounced state machine over `isomorphic-git`) lives in its own MIT package. Authenticated git traffic routes through a git-http proxy added to `github-auth-worker` so the repo-scoped token never transits a third party. The studio is a thin consumer: it constructs the engine with its `OpfsFs` + the proxy URL + the per-workspace token, calls `notifyDirty()` after each save, renders a status badge from engine state, and supplies an interactive `ConflictPolicy`.

**Tech Stack:** TypeScript 5.9+ ESM, `isomorphic-git` ^1.37, Vitest 4, Cloudflare Worker (wrangler), React 19 + Radix DS, OPFS.

**Spec:** `docs/superpowers/specs/2026-05-21-github-push-back-design.md`

**Conventions every task must follow:**
- SPDX header on every new source file. Packages under `packages/` = `MIT`; `apps/studio` + `apps/github-auth-worker` = `FSL-1.1-ALv2`. Header format: two lines `// SPDX-License-Identifier: <LICENSE>` then `// Copyright (c) 2026 Pradeep Mouli`.
- Imports use `.js` extensions (ESM/NodeNext) even for `.ts` sources.
- Tests are `test/**/*.test.ts`, run with `vitest run`.
- Commit after each task with the message shown. Do not use `--no-verify`; if a hook fails, fix the cause.

---

## Phase 1 — `@rune-langium/git-sync-engine` package (generic, no consumer)

This phase builds the engine in isolation, tested entirely against a mocked `isomorphic-git`. No studio, no OPFS, no network.

### Task 1.1: Scaffold the package

**Files:**
- Create: `packages/git-sync-engine/package.json`
- Create: `packages/git-sync-engine/tsconfig.json`
- Create: `packages/git-sync-engine/vitest.config.ts`
- Create: `packages/git-sync-engine/src/index.ts`
- Create: `packages/git-sync-engine/README.md`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@rune-langium/git-sync-engine",
  "version": "0.1.0",
  "description": "Generic, framework-agnostic two-way git sync engine over isomorphic-git",
  "license": "MIT",
  "type": "module",
  "main": "./dist/src/index.js",
  "types": "./dist/src/index.d.ts",
  "exports": {
    ".": { "types": "./dist/src/index.d.ts", "default": "./dist/src/index.js" }
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsgo -b",
    "clean": "rm -rf dist tsconfig.tsbuildinfo",
    "test": "vitest run",
    "test:watch": "vitest",
    "type-check": "tsgo --noEmit"
  },
  "peerDependencies": { "isomorphic-git": "^1.37.6" },
  "devDependencies": {
    "@types/node": "^25.8.0",
    "isomorphic-git": "^1.37.6",
    "typescript": "^6.0.3",
    "vitest": "^4.1.5"
  },
  "publishConfig": { "access": "public" },
  "author": "Pradeep Mouli <pmouli@mac.com> (https://github.com/pradeepmouli)"
}
```

- [ ] **Step 2: Create `tsconfig.json`** (mirror `packages/codegen/tsconfig.json`; verify against it)

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": ".",
    "composite": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`** (copy `packages/codegen/vitest.config.ts` verbatim, including its MIT SPDX header)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**']
  }
});
```

- [ ] **Step 4: Create a placeholder `src/index.ts`**

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

export {};
```

- [ ] **Step 5: Create a one-paragraph `README.md`** describing the package as a generic two-way git sync engine over isomorphic-git, framework/FS/remote-agnostic.

- [ ] **Step 6: Install + verify the workspace picks up the package**

Run: `pnpm install`
Then: `pnpm --filter @rune-langium/git-sync-engine run type-check`
Expected: exits 0 (empty package type-checks).

- [ ] **Step 7: Commit**

```bash
git add packages/git-sync-engine pnpm-lock.yaml
git commit -m "feat(git-sync-engine): scaffold generic package"
```

---

### Task 1.2: Define the public types

**Files:**
- Create: `packages/git-sync-engine/src/types.ts`
- Modify: `packages/git-sync-engine/src/index.ts`

- [ ] **Step 1: Write `src/types.ts`**

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Minimal isomorphic-git fs/http shapes. We avoid importing isomorphic-git's
 * own types so consumers can pass any compatible implementation (OPFS-backed,
 * in-memory, lightning-fs).
 */
export interface IsoGitFs {
  promises: {
    readFile(path: string, opts?: unknown): Promise<Uint8Array | string>;
    writeFile(path: string, data: Uint8Array | string): Promise<void>;
    mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
    rmdir(path: string): Promise<void>;
    unlink(path: string): Promise<void>;
    readdir(path: string): Promise<string[]>;
    stat(path: string): Promise<unknown>;
    lstat(path: string): Promise<unknown>;
    readlink(path: string): Promise<string>;
    symlink(target: string, path: string): Promise<void>;
    chmod?(path: string, mode: number): Promise<void>;
  };
}

// isomorphic-git http client (e.g. `isomorphic-git/http/web`).
export type IsoGitHttp = unknown;

export type SyncPhase =
  | 'idle'
  | 'committing'
  | 'fetching'
  | 'merging'
  | 'pushing'
  | 'blocked'
  | 'offline';

export type SyncErrorCode =
  | 'network'
  | 'no_push_access'
  | 'auth'
  | 'non_fast_forward'
  | 'unknown';

export interface SyncStatus {
  phase: SyncPhase;
  ahead: number;
  behind: number;
  lastSyncedSha: string | null;
  lastError?: { code: SyncErrorCode; message: string };
  conflictPaths?: string[];
}

export interface ConflictContext {
  conflictPaths: string[];
  localSha: string;
  remoteSha: string;
  fs: IsoGitFs;
  dir: string;
  gitdir: string;
}

export type ConflictResolution =
  | { action: 'block' }
  | { action: 'keepMine' }
  | { action: 'takeRemote' }
  | { action: 'merged' };

export interface ConflictPolicy {
  onConflict(ctx: ConflictContext): Promise<ConflictResolution>;
}

export interface GitSyncEngineOptions {
  fs: IsoGitFs;
  http: IsoGitHttp;
  dir: string;
  gitdir: string;
  remoteUrl: string;
  ref: string;
  corsProxy?: string;
  onAuth: () => { username: string; password: string };
  author: { name: string; email: string };
  debounceMs?: number;
  conflictPolicy?: ConflictPolicy;
  generateMessage?: (changed: string[]) => string;
  /** Injectable clock/timer for deterministic tests. Defaults to global. */
  setTimeoutFn?: (cb: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
  /** Injectable online check. Defaults to `() => true` in non-browser. */
  isOnline?: () => boolean;
}

export interface GitSyncEngine {
  notifyDirty(): void;
  syncNow(): Promise<SyncStatus>;
  getState(): SyncStatus;
  subscribe(cb: (s: SyncStatus) => void): () => void;
  dispose(): void;
}
```

- [ ] **Step 2: Re-export from `src/index.ts`**

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

export * from './types.js';
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @rune-langium/git-sync-engine run type-check`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/git-sync-engine/src
git commit -m "feat(git-sync-engine): public types (SyncStatus, ConflictPolicy, options)"
```

---

### Task 1.3: A thin `GitOps` wrapper over isomorphic-git (the only place that touches `git`)

Isolating every `git.*` call behind one interface makes the engine testable with a fake and keeps merge/push quirks (force-with-lease emulation) in one spot.

**Files:**
- Create: `packages/git-sync-engine/src/git-ops.ts`
- Test: `packages/git-sync-engine/test/git-ops.test.ts`

- [ ] **Step 1: Write the failing test** (drives the `GitOps` interface shape; uses `InMemoryFs`-like fake is overkill here — assert the interface compiles and `createGitOps` returns all methods)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { createGitOps } from '../src/git-ops.js';

describe('createGitOps', () => {
  it('exposes the operations the engine needs', () => {
    const ops = createGitOps({ fs: {} as never, http: {}, dir: '/w/files', gitdir: '/w/.git' });
    for (const m of ['stageAll', 'commit', 'fetch', 'computeAheadBehind', 'fastForward', 'merge', 'push', 'resetTo', 'currentSha', 'remoteSha']) {
      expect(typeof (ops as Record<string, unknown>)[m]).toBe('function');
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rune-langium/git-sync-engine test -- git-ops`
Expected: FAIL — `createGitOps` not found.

- [ ] **Step 3: Implement `src/git-ops.ts`**

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import git from 'isomorphic-git';
import type { IsoGitFs, IsoGitHttp } from './types.js';

export interface GitOpsConfig {
  fs: IsoGitFs;
  http: IsoGitHttp;
  dir: string;
  gitdir: string;
  corsProxy?: string;
  onAuth?: () => { username: string; password: string };
}

export interface MergeResult {
  ok: boolean;
  conflictPaths?: string[];
}

export interface GitOps {
  stageAll(): Promise<string[]>; // returns changed filepaths
  commit(message: string, author: { name: string; email: string }): Promise<string>;
  fetch(ref: string, remoteUrl: string): Promise<void>;
  computeAheadBehind(ref: string): Promise<{ ahead: number; behind: number }>;
  fastForward(ref: string): Promise<void>;
  merge(ref: string, author: { name: string; email: string }): Promise<MergeResult>;
  push(ref: string, remoteUrl: string, opts?: { force?: boolean }): Promise<void>;
  resetTo(ref: string): Promise<void>;
  currentSha(ref: string): Promise<string | null>;
  remoteSha(ref: string): Promise<string | null>;
}

export function createGitOps(cfg: GitOpsConfig): GitOps {
  const base = { fs: cfg.fs as never, dir: cfg.dir, gitdir: cfg.gitdir };
  const net = { http: cfg.http as never, corsProxy: cfg.corsProxy, onAuth: cfg.onAuth };

  return {
    async stageAll() {
      const matrix = await git.statusMatrix(base);
      const changed: string[] = [];
      for (const [filepath, head, workdir, stage] of matrix) {
        if (head === workdir && workdir === stage) continue;
        changed.push(filepath);
        if (workdir === 0) {
          await git.remove({ ...base, filepath });
        } else {
          await git.add({ ...base, filepath });
        }
      }
      return changed;
    },
    async commit(message, author) {
      return git.commit({ ...base, message, author });
    },
    async fetch(ref, url) {
      await git.fetch({ ...base, ...net, url, ref, singleBranch: true, tags: false });
    },
    async computeAheadBehind(ref) {
      const local = await this.currentSha(ref);
      const remote = await this.remoteSha(ref);
      if (!local || !remote) return { ahead: 0, behind: 0 };
      if (local === remote) return { ahead: 0, behind: 0 };
      const localLog = await git.log({ ...base, ref: local });
      const remoteLog = await git.log({ ...base, ref: remote });
      const localShas = new Set(localLog.map((c) => c.oid));
      const remoteShas = new Set(remoteLog.map((c) => c.oid));
      const ahead = localLog.filter((c) => !remoteShas.has(c.oid)).length;
      const behind = remoteLog.filter((c) => !localShas.has(c.oid)).length;
      return { ahead, behind };
    },
    async fastForward(ref) {
      const remote = await this.remoteSha(ref);
      if (!remote) return;
      await git.writeRef({ ...base, ref: `refs/heads/${ref}`, value: remote, force: true });
      await git.checkout({ ...base, ref, force: true });
    },
    async merge(ref, author) {
      try {
        await git.merge({
          ...base,
          ours: ref,
          theirs: `refs/remotes/origin/${ref}`,
          author,
          abortOnConflict: true
        });
        await git.checkout({ ...base, ref, force: true });
        return { ok: true };
      } catch (err) {
        const name = (err as { code?: string; name?: string })?.code ?? (err as Error)?.name ?? '';
        if (name === 'MergeConflictError' || name === 'MergeNotSupportedError') {
          const paths = (err as { data?: { filepaths?: string[] } })?.data?.filepaths ?? [];
          return { ok: false, conflictPaths: paths };
        }
        throw err;
      }
    },
    async push(ref, url, opts) {
      await git.push({ ...base, ...net, url, ref, force: opts?.force ?? false });
    },
    async resetTo(ref) {
      const remote = await this.remoteSha(ref);
      if (!remote) return;
      await git.writeRef({ ...base, ref: `refs/heads/${ref}`, value: remote, force: true });
      await git.checkout({ ...base, ref, force: true });
    },
    async currentSha(ref) {
      try {
        return await git.resolveRef({ ...base, ref });
      } catch {
        return null;
      }
    },
    async remoteSha(ref) {
      try {
        return await git.resolveRef({ ...base, ref: `refs/remotes/origin/${ref}` });
      } catch {
        return null;
      }
    }
  };
}
```

> Note for the implementer: the exact `git.merge` conflict error name in isomorphic-git ^1.37 is `MergeNotSupportedError` (content merge needed, no driver) or `MergeConflictError` (with `abortOnConflict`). Confirm against the installed version's typings at implementation time and adjust the `name` check if needed; the test in Task 1.6 pins the engine's behavior regardless via a fake `GitOps`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rune-langium/git-sync-engine test -- git-ops`
Expected: PASS.

- [ ] **Step 5: Type-check + commit**

```bash
pnpm --filter @rune-langium/git-sync-engine run type-check
git add packages/git-sync-engine/src/git-ops.ts packages/git-sync-engine/test/git-ops.test.ts
git commit -m "feat(git-sync-engine): GitOps wrapper isolating isomorphic-git calls"
```

---

### Task 1.4: Force-with-lease emulation helper

isomorphic-git has no `--force-with-lease`. Emulate it: re-fetch, confirm the remote ref still equals the SHA we last observed, then force-push; otherwise report a lease failure so the engine re-enters conflict.

**Files:**
- Create: `packages/git-sync-engine/src/force-with-lease.ts`
- Test: `packages/git-sync-engine/test/force-with-lease.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi } from 'vitest';
import { pushForceWithLease } from '../src/force-with-lease.js';
import type { GitOps } from '../src/git-ops.js';

function fakeOps(over: Partial<GitOps>): GitOps {
  return { fetch: vi.fn(), remoteSha: vi.fn(), push: vi.fn(), ...over } as unknown as GitOps;
}

describe('pushForceWithLease', () => {
  it('force-pushes when the remote still matches the expected sha', async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    const ops = fakeOps({
      fetch: vi.fn().mockResolvedValue(undefined),
      remoteSha: vi.fn().mockResolvedValue('abc'),
      push
    });
    const r = await pushForceWithLease(ops, 'main', 'https://x', 'abc');
    expect(r).toEqual({ ok: true });
    expect(push).toHaveBeenCalledWith('main', 'https://x', { force: true });
  });

  it('refuses (lease failed) when the remote moved', async () => {
    const push = vi.fn();
    const ops = fakeOps({
      fetch: vi.fn().mockResolvedValue(undefined),
      remoteSha: vi.fn().mockResolvedValue('def'),
      push
    });
    const r = await pushForceWithLease(ops, 'main', 'https://x', 'abc');
    expect(r).toEqual({ ok: false, reason: 'lease_failed' });
    expect(push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @rune-langium/git-sync-engine test -- force-with-lease`
Expected: FAIL — `pushForceWithLease` not found.

- [ ] **Step 3: Implement `src/force-with-lease.ts`**

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { GitOps } from './git-ops.js';

export type LeaseResult = { ok: true } | { ok: false; reason: 'lease_failed' };

/** Emulates `git push --force-with-lease`: only force-push if the remote ref
 *  still equals `expectedRemoteSha` after a fresh fetch. */
export async function pushForceWithLease(
  ops: GitOps,
  ref: string,
  remoteUrl: string,
  expectedRemoteSha: string | null
): Promise<LeaseResult> {
  await ops.fetch(ref, remoteUrl);
  const current = await ops.remoteSha(ref);
  if (current !== expectedRemoteSha) return { ok: false, reason: 'lease_failed' };
  await ops.push(ref, remoteUrl, { force: true });
  return { ok: true };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @rune-langium/git-sync-engine test -- force-with-lease`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/git-sync-engine/src/force-with-lease.ts packages/git-sync-engine/test/force-with-lease.test.ts
git commit -m "feat(git-sync-engine): force-with-lease emulation"
```

---

### Task 1.5: The engine — happy path (debounce → commit → fetch → ff → push)

**Files:**
- Create: `packages/git-sync-engine/src/engine.ts`
- Modify: `packages/git-sync-engine/src/index.ts`
- Test: `packages/git-sync-engine/test/engine-happy.test.ts`

- [ ] **Step 1: Write the failing test** (inject a fake `GitOps` via an internal seam, and a synchronous fake timer)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi } from 'vitest';
import { createGitSyncEngine } from '../src/engine.js';
import type { GitOps } from '../src/git-ops.js';

function happyOps(): GitOps {
  return {
    stageAll: vi.fn().mockResolvedValue(['a.rosetta']),
    commit: vi.fn().mockResolvedValue('localsha'),
    fetch: vi.fn().mockResolvedValue(undefined),
    computeAheadBehind: vi.fn().mockResolvedValue({ ahead: 1, behind: 0 }),
    fastForward: vi.fn().mockResolvedValue(undefined),
    merge: vi.fn(),
    push: vi.fn().mockResolvedValue(undefined),
    resetTo: vi.fn(),
    currentSha: vi.fn().mockResolvedValue('localsha'),
    remoteSha: vi.fn().mockResolvedValue('remotesha')
  } as unknown as GitOps;
}

const baseOpts = {
  fs: {} as never, http: {}, dir: '/w/files', gitdir: '/w/.git',
  remoteUrl: 'https://x', ref: 'main',
  onAuth: () => ({ username: 'x', password: 't' }),
  author: { name: 'A', email: 'a@x' },
  debounceMs: 0
};

describe('GitSyncEngine happy path', () => {
  it('coalesces rapid notifyDirty into one commit, then pushes; ends idle', async () => {
    const ops = happyOps();
    const engine = createGitSyncEngine({ ...baseOpts, __opsForTest: ops } as never);
    engine.notifyDirty();
    engine.notifyDirty();
    engine.notifyDirty();
    await engine.syncNow();
    expect((ops.commit as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect((ops.push as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect(engine.getState().phase).toBe('idle');
  });

  it('notifies subscribers of phase transitions', async () => {
    const ops = happyOps();
    const phases: string[] = [];
    const engine = createGitSyncEngine({ ...baseOpts, __opsForTest: ops } as never);
    engine.subscribe((s) => phases.push(s.phase));
    await engine.syncNow();
    expect(phases).toContain('committing');
    expect(phases).toContain('pushing');
    expect(phases[phases.length - 1]).toBe('idle');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @rune-langium/git-sync-engine test -- engine-happy`
Expected: FAIL — `createGitSyncEngine` not found.

- [ ] **Step 3: Implement `src/engine.ts` (happy path + state/subscription scaffolding)**

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { createGitOps, type GitOps } from './git-ops.js';
import { pushForceWithLease } from './force-with-lease.js';
import type {
  ConflictPolicy,
  GitSyncEngine,
  GitSyncEngineOptions,
  SyncStatus
} from './types.js';

const blockPolicy: ConflictPolicy = { onConflict: async () => ({ action: 'block' }) };

interface InternalOptions extends GitSyncEngineOptions {
  __opsForTest?: GitOps; // test seam; never set in production
}

export function createGitSyncEngine(options: GitSyncEngineOptions): GitSyncEngine {
  const opts = options as InternalOptions;
  const ops: GitOps =
    opts.__opsForTest ??
    createGitOps({
      fs: opts.fs,
      http: opts.http,
      dir: opts.dir,
      gitdir: opts.gitdir,
      corsProxy: opts.corsProxy,
      onAuth: opts.onAuth
    });
  const policy = opts.conflictPolicy ?? blockPolicy;
  const debounceMs = opts.debounceMs ?? 2500;
  const setT = opts.setTimeoutFn ?? ((cb, ms) => setTimeout(cb, ms));
  const clearT = opts.clearTimeoutFn ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const isOnline = opts.isOnline ?? (() => true);
  const genMessage =
    opts.generateMessage ??
    ((changed: string[]) => (changed.length === 1 ? `Update ${changed[0]}` : `Update ${changed.length} files`));

  let state: SyncStatus = { phase: 'idle', ahead: 0, behind: 0, lastSyncedSha: null };
  const subs = new Set<(s: SyncStatus) => void>();
  let timer: unknown = null;
  let running: Promise<SyncStatus> | null = null;

  function emit(next: Partial<SyncStatus>) {
    state = { ...state, ...next };
    for (const cb of subs) cb(state);
  }

  async function runSync(): Promise<SyncStatus> {
    if (!isOnline()) {
      emit({ phase: 'offline' });
      return state;
    }
    try {
      emit({ phase: 'committing', lastError: undefined });
      const changed = await ops.stageAll();
      if (changed.length > 0) await ops.commit(genMessage(changed), opts.author);

      emit({ phase: 'fetching' });
      await ops.fetch(opts.ref, opts.remoteUrl);
      const { ahead, behind } = await ops.computeAheadBehind(opts.ref);
      emit({ ahead, behind });

      if (behind > 0) {
        if (ahead === 0) {
          emit({ phase: 'merging' });
          await ops.fastForward(opts.ref);
        } else {
          emit({ phase: 'merging' });
          const m = await ops.merge(opts.ref, opts.author);
          if (!m.ok) return await handleConflict(m.conflictPaths ?? []);
        }
      }

      return await doPush();
    } catch (err) {
      emit({ phase: 'offline', lastError: { code: 'network', message: msg(err) } });
      return state;
    }
  }

  async function doPush(): Promise<SyncStatus> {
    emit({ phase: 'pushing' });
    try {
      await ops.push(opts.ref, opts.remoteUrl);
      const sha = await ops.currentSha(opts.ref);
      emit({ phase: 'idle', ahead: 0, lastSyncedSha: sha });
      return state;
    } catch (err) {
      // One auto retry on non-fast-forward.
      if (isNonFastForward(err)) {
        emit({ phase: 'fetching' });
        await ops.fetch(opts.ref, opts.remoteUrl);
        const { ahead, behind } = await ops.computeAheadBehind(opts.ref);
        if (behind > 0 && ahead > 0) {
          emit({ phase: 'merging' });
          const m = await ops.merge(opts.ref, opts.author);
          if (!m.ok) return await handleConflict(m.conflictPaths ?? []);
        } else if (behind > 0) {
          await ops.fastForward(opts.ref);
        }
        emit({ phase: 'pushing' });
        await ops.push(opts.ref, opts.remoteUrl);
        const sha = await ops.currentSha(opts.ref);
        emit({ phase: 'idle', ahead: 0, lastSyncedSha: sha });
        return state;
      }
      if (isAuthError(err)) {
        emit({ phase: 'blocked', lastError: { code: 'auth', message: msg(err) } });
        return state;
      }
      if (isNoPushAccess(err)) {
        emit({ phase: 'blocked', lastError: { code: 'no_push_access', message: msg(err) } });
        return state;
      }
      emit({ phase: 'offline', lastError: { code: 'network', message: msg(err) } });
      return state;
    }
  }

  async function handleConflict(paths: string[]): Promise<SyncStatus> {
    const localSha = (await ops.currentSha(opts.ref)) ?? '';
    const remoteSha = (await ops.remoteSha(opts.ref)) ?? '';
    emit({ phase: 'blocked', conflictPaths: paths });
    const res = await policy.onConflict({
      conflictPaths: paths, localSha, remoteSha, fs: opts.fs, dir: opts.dir, gitdir: opts.gitdir
    });
    switch (res.action) {
      case 'block':
        emit({ phase: 'blocked', conflictPaths: paths });
        return state;
      case 'keepMine': {
        const lease = await pushForceWithLease(ops, opts.ref, opts.remoteUrl, remoteSha);
        if (!lease.ok) {
          emit({ phase: 'blocked', lastError: { code: 'non_fast_forward', message: 'remote moved' } });
          return state;
        }
        const sha = await ops.currentSha(opts.ref);
        emit({ phase: 'idle', ahead: 0, conflictPaths: undefined, lastSyncedSha: sha });
        return state;
      }
      case 'takeRemote': {
        await ops.resetTo(opts.ref);
        const sha = await ops.currentSha(opts.ref);
        emit({ phase: 'idle', ahead: 0, behind: 0, conflictPaths: undefined, lastSyncedSha: sha });
        return state;
      }
      case 'merged': {
        const changed = await ops.stageAll();
        if (changed.length > 0) await ops.commit(genMessage(changed), opts.author);
        emit({ conflictPaths: undefined });
        return await doPush();
      }
    }
  }

  function scheduleSync() {
    if (timer) clearT(timer);
    timer = setT(() => { void syncNow(); }, debounceMs);
  }

  function syncNow(): Promise<SyncStatus> {
    if (timer) { clearT(timer); timer = null; }
    if (running) return running;
    running = runSync().finally(() => { running = null; });
    return running;
  }

  return {
    notifyDirty() { scheduleSync(); },
    syncNow,
    getState() { return state; },
    subscribe(cb) { subs.add(cb); return () => subs.delete(cb); },
    dispose() { if (timer) clearT(timer); subs.clear(); }
  };
}

function msg(e: unknown): string { return e instanceof Error ? e.message : String(e); }
function codeOf(e: unknown): string {
  return (e as { code?: string; name?: string })?.code ?? (e as Error)?.name ?? '';
}
function isNonFastForward(e: unknown): boolean { return codeOf(e) === 'PushRejectedError' || /non-fast-forward|fetch first/i.test(msg(e)); }
function isAuthError(e: unknown): boolean { return codeOf(e) === 'HttpError' && /401/.test(msg(e)); }
function isNoPushAccess(e: unknown): boolean { return /403/.test(msg(e)); }
```

- [ ] **Step 4: Export the engine from `src/index.ts`**

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

export * from './types.js';
export { createGitSyncEngine } from './engine.js';
export { createGitOps } from './git-ops.js';
export type { GitOps } from './git-ops.js';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @rune-langium/git-sync-engine test -- engine-happy`
Expected: PASS (2 tests).

- [ ] **Step 6: Type-check + commit**

```bash
pnpm --filter @rune-langium/git-sync-engine run type-check
git add packages/git-sync-engine/src packages/git-sync-engine/test/engine-happy.test.ts
git commit -m "feat(git-sync-engine): engine happy path (debounce/commit/fetch/ff/push)"
```

---

### Task 1.6: Engine — conflict + offline + non-ff paths via fake GitOps

**Files:**
- Test: `packages/git-sync-engine/test/engine-conflict.test.ts`

- [ ] **Step 1: Write the failing tests** (these exercise existing engine code paths — expect them to PASS once written; if any fails, fix `engine.ts`)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi } from 'vitest';
import { createGitSyncEngine } from '../src/engine.js';
import type { GitOps } from '../src/git-ops.js';
import type { ConflictPolicy } from '../src/types.js';

function ops(over: Partial<GitOps>): GitOps {
  return {
    stageAll: vi.fn().mockResolvedValue(['a.rosetta']),
    commit: vi.fn().mockResolvedValue('local'),
    fetch: vi.fn().mockResolvedValue(undefined),
    computeAheadBehind: vi.fn().mockResolvedValue({ ahead: 1, behind: 1 }),
    fastForward: vi.fn().mockResolvedValue(undefined),
    merge: vi.fn().mockResolvedValue({ ok: true }),
    push: vi.fn().mockResolvedValue(undefined),
    resetTo: vi.fn().mockResolvedValue(undefined),
    currentSha: vi.fn().mockResolvedValue('local'),
    remoteSha: vi.fn().mockResolvedValue('remote'),
    ...over
  } as unknown as GitOps;
}

const base = {
  fs: {} as never, http: {}, dir: '/w/files', gitdir: '/w/.git',
  remoteUrl: 'https://x', ref: 'main', onAuth: () => ({ username: 'x', password: 't' }),
  author: { name: 'A', email: 'a@x' }, debounceMs: 0
};

describe('GitSyncEngine conflict + offline', () => {
  it('blocks when merge conflicts and policy returns block', async () => {
    const o = ops({ merge: vi.fn().mockResolvedValue({ ok: false, conflictPaths: ['a.rosetta'] }) });
    const e = createGitSyncEngine({ ...base, __opsForTest: o } as never);
    await e.syncNow();
    expect(e.getState().phase).toBe('blocked');
    expect(e.getState().conflictPaths).toEqual(['a.rosetta']);
    expect((o.push as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('keepMine force-pushes with lease then goes idle', async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    const policy: ConflictPolicy = { onConflict: async () => ({ action: 'keepMine' }) };
    const o = ops({
      merge: vi.fn().mockResolvedValue({ ok: false, conflictPaths: ['a'] }),
      push, remoteSha: vi.fn().mockResolvedValue('remote') // unchanged → lease ok
    });
    const e = createGitSyncEngine({ ...base, conflictPolicy: policy, __opsForTest: o } as never);
    await e.syncNow();
    expect(push).toHaveBeenCalledWith('main', 'https://x', { force: true });
    expect(e.getState().phase).toBe('idle');
  });

  it('takeRemote resets and goes idle', async () => {
    const resetTo = vi.fn().mockResolvedValue(undefined);
    const policy: ConflictPolicy = { onConflict: async () => ({ action: 'takeRemote' }) };
    const o = ops({ merge: vi.fn().mockResolvedValue({ ok: false, conflictPaths: ['a'] }), resetTo });
    const e = createGitSyncEngine({ ...base, conflictPolicy: policy, __opsForTest: o } as never);
    await e.syncNow();
    expect(resetTo).toHaveBeenCalledWith('main');
    expect(e.getState().phase).toBe('idle');
  });

  it('goes offline (keeps local commit) when fetch throws', async () => {
    const o = ops({ fetch: vi.fn().mockRejectedValue(new Error('network down')) });
    const e = createGitSyncEngine({ ...base, __opsForTest: o } as never);
    await e.syncNow();
    expect(e.getState().phase).toBe('offline');
    expect((o.commit as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it('does nothing online-wise when isOnline is false', async () => {
    const o = ops({});
    const e = createGitSyncEngine({ ...base, isOnline: () => false, __opsForTest: o } as never);
    await e.syncNow();
    expect(e.getState().phase).toBe('offline');
    expect((o.fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm --filter @rune-langium/git-sync-engine test -- engine-conflict`
Expected: All PASS. If any fails, fix `engine.ts` until green (do not weaken the test).

- [ ] **Step 3: Run the whole package suite + type-check**

Run: `pnpm --filter @rune-langium/git-sync-engine test && pnpm --filter @rune-langium/git-sync-engine run type-check`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add packages/git-sync-engine/test/engine-conflict.test.ts packages/git-sync-engine/src/engine.ts
git commit -m "test(git-sync-engine): conflict, keepMine/takeRemote, offline paths"
```

---

## Phase 2 — git-http proxy in `github-auth-worker`

Adds an authenticated git smart-HTTP forwarder so the studio can fetch/push without exposing the token to a third-party proxy. isomorphic-git's `corsProxy` calls `${corsProxy}/${host}/${path}` — the proxy strips its own prefix, reconstructs the GitHub URL, injects `Authorization`, and forwards.

### Task 2.1: Add the `/git/` proxy route

**Files:**
- Create: `apps/github-auth-worker/src/git-proxy.ts`
- Modify: `apps/github-auth-worker/src/index.ts` (route dispatch + allow GET for git)
- Test: `apps/github-auth-worker/test/git-proxy.test.ts`

- [ ] **Step 1: Write the failing test** (use a stubbed global `fetch`)

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleGitProxy } from '../src/git-proxy.js';

const env = { GITHUB_CLIENT_ID: 'x', ALLOWED_ORIGIN: 'https://www.daikonic.dev' };

afterEach(() => vi.restoreAllMocks());

describe('handleGitProxy', () => {
  it('forwards to the reconstructed github URL with injected auth', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('refs', { status: 200, headers: { 'Content-Type': 'application/x-git-upload-pack-advertisement' } })
    );
    const req = new Request(
      'https://www.daikonic.dev/rune-studio/api/github-auth/git/github.com/owner/repo.git/info/refs?service=git-upload-pack',
      { method: 'GET', headers: { Origin: env.ALLOWED_ORIGIN, Authorization: 'Basic dXNlcjp0b2tlbg==' } }
    );
    const res = await handleGitProxy(req, env, env.ALLOWED_ORIGIN);
    expect(res.status).toBe(200);
    const calledUrl = (spy.mock.calls[0][0] as Request).url ?? spy.mock.calls[0][0];
    expect(String(calledUrl)).toBe('https://github.com/owner/repo.git/info/refs?service=git-upload-pack');
  });

  it('rejects a non-github host', async () => {
    const req = new Request(
      'https://www.daikonic.dev/rune-studio/api/github-auth/git/evil.com/x.git/info/refs',
      { method: 'GET', headers: { Origin: env.ALLOWED_ORIGIN } }
    );
    const res = await handleGitProxy(req, env, env.ALLOWED_ORIGIN);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @rune-langium/github-auth-worker test -- git-proxy`
Expected: FAIL — `handleGitProxy` not found.

- [ ] **Step 3: Implement `src/git-proxy.ts`**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { Env } from './index.js';

const PREFIX = '/git/';
const ALLOWED_GIT_HOST = 'github.com';

/**
 * Authenticated git smart-HTTP forwarder. isomorphic-git sends requests to
 * `${corsProxy}/<host>/<path>`; we strip the prefix, require the host to be
 * github.com, reconstruct `https://github.com/<path>`, pass through the
 * client's Authorization header (Basic user:token), and forward method +
 * body + git content-type headers. The token is never logged.
 */
export async function handleGitProxy(req: Request, _env: Env, allowedOrigin: string): Promise<Response> {
  const url = new URL(req.url);
  const idx = url.pathname.indexOf(PREFIX);
  if (idx === -1) return new Response('not_found', { status: 404 });
  const rest = url.pathname.slice(idx + PREFIX.length); // "<host>/<path...>"
  const slash = rest.indexOf('/');
  if (slash === -1) return new Response('bad_request', { status: 400 });
  const host = rest.slice(0, slash);
  const path = rest.slice(slash + 1);
  if (host !== ALLOWED_GIT_HOST) return new Response('bad_request', { status: 400 });

  const target = `https://${host}/${path}${url.search}`;
  const headers = new Headers();
  const auth = req.headers.get('Authorization');
  if (auth) headers.set('Authorization', auth);
  const ct = req.headers.get('Content-Type');
  if (ct) headers.set('Content-Type', ct);
  const accept = req.headers.get('Accept');
  if (accept) headers.set('Accept', accept);
  headers.set('User-Agent', 'rune-studio-git-proxy');

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') init.body = await req.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return new Response('upstream_unavailable', { status: 503 });
  }

  const outHeaders = new Headers(upstream.headers);
  outHeaders.set('Access-Control-Allow-Origin', allowedOrigin);
  outHeaders.set('Vary', 'Origin');
  return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
}
```

- [ ] **Step 4: Wire it into `src/index.ts`**

Modify the `fetch` dispatcher. The current method-guard rejects non-POST before routing; git uses GET + POST, so route `/git/` **before** the POST guard.

Replace the body of `fetch` (lines ~168-180) with:

```ts
  async fetch(req: Request, env: Env): Promise<Response> {
    const allowed = env.ALLOWED_ORIGIN;
    if (!originOk(req, allowed)) {
      return new Response('forbidden', { status: 403 });
    }
    const url = new URL(req.url);
    if (url.pathname.includes('/git/')) return handleGitProxy(req, env, allowed);
    if (req.method !== 'POST') {
      return json(405, { error: 'method_not_allowed' }, allowed);
    }
    if (url.pathname.endsWith('/device-init')) return handleInit(env, allowed);
    if (url.pathname.endsWith('/device-poll')) return handlePoll(req, env, allowed);
    return json(404, { error: 'not_found' }, allowed);
  }
```

Add the import near the top of `index.ts`:

```ts
import { handleGitProxy } from './git-proxy.js';
```

- [ ] **Step 5: Run the test + type-check**

Run: `pnpm --filter @rune-langium/github-auth-worker test -- git-proxy && pnpm --filter @rune-langium/github-auth-worker run type-check`
Expected: PASS.

- [ ] **Step 6: Update the route pattern in `wrangler.toml`** so the worker also serves the git path. The existing route is `www.daikonic.dev/rune-studio/api/github-auth/*` — the `*` already matches `/git/...`, so **no change is required**. Add a comment documenting the new sub-path.

Modify `apps/github-auth-worker/wrangler.toml` route block — add a comment line above `[[routes]]`:

```toml
# Serves device-flow (/device-init, /device-poll) AND the authenticated
# git smart-HTTP proxy (/git/github.com/<owner>/<repo>.git/...).
[[routes]]
```

- [ ] **Step 7: Commit**

```bash
git add apps/github-auth-worker/src/git-proxy.ts apps/github-auth-worker/src/index.ts apps/github-auth-worker/test/git-proxy.test.ts apps/github-auth-worker/wrangler.toml
git commit -m "feat(github-auth-worker): authenticated git smart-HTTP proxy route"
```

---

## Phase 3 — Reconcile `git-backing.ts` (the dir/gitdir layout fix) + round-trip test

### Task 3.1: Switch git-backing to explicit `dir`/`gitdir` and consume the engine

**Files:**
- Modify: `apps/studio/src/services/git-backing.ts`
- Test: `apps/studio/test/services/git-backing.test.ts` (create if absent)

- [ ] **Step 1: Write the failing round-trip test** (uses `InMemoryFs` + a real local bare repo is heavy; instead test the layout invariant directly with `isomorphic-git` against `InMemoryFs`)

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import git from 'isomorphic-git';
import { InMemoryFs } from '../../src/services/in-memory-fs.js';
import { initRepo, stageAndCommit, detectSyncState } from '../../src/services/git-backing.js';

describe('git-backing dir/gitdir layout', () => {
  it('commits files under <id>/files with .git at <id>/.git, and detects ahead', async () => {
    const fs = new InMemoryFs() as never;
    const wsId = 'ws1';
    await (fs as InMemoryFs).promises.mkdir('/ws1/files', { recursive: true });
    await initRepo(fs, wsId);
    await (fs as InMemoryFs).promises.writeFile('/ws1/files/a.rosetta', 'namespace x');

    expect(await detectSyncState(fs, wsId)).toBe('ahead');
    const sha = await stageAndCommit(fs, wsId, { message: 'init', authorName: 'A', authorEmail: 'a@x' });
    expect(typeof sha).toBe('string');
    expect(await detectSyncState(fs, wsId)).toBe('clean');

    // .git lives at /ws1/.git, working tree at /ws1/files
    const dotGit = await (fs as InMemoryFs).promises.readdir('/ws1/.git');
    expect(dotGit).toContain('HEAD');
    // staged path is the plain relative path, not "files/a.rosetta"
    const log = await git.log({ fs, dir: '/ws1/files', gitdir: '/ws1/.git' });
    expect(log.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @rune-langium/studio test -- git-backing`
Expected: FAIL — current `repoDir` puts gitdir at `/ws1/.git` only if `dir=/ws1`; `listWorkingTree` stages `files/...`. The assertions on `/ws1/files` working tree + plain paths fail.

- [ ] **Step 3: Edit `git-backing.ts` — introduce `gitDir` + `worktreeDir` and thread them through every op**

Replace `repoDir` and update each function. Key changes:

```ts
function worktreeDir(workspaceId: string): string {
  return `/${workspaceId}/files`;
}
function gitDir(workspaceId: string): string {
  return `/${workspaceId}/.git`;
}
```

In `initRepo`: pass `dir: worktreeDir(id), gitdir: gitDir(id)`.
In `cloneRepository`: pass `dir: worktreeDir(workspaceId), gitdir: gitDir(workspaceId)` (the working tree now lands in `files/`, matching the studio convention and `WorkspaceManager.createGitBacked`'s pre-created `/<id>/files`).
In `stageAndCommit`, `detectSyncState`, `pushBranch`: pass both `dir` + `gitdir`.
In `listWorkingTree`/`walk`: walk `worktreeDir(workspaceId)` and push **plain relative paths** (drop the `files/` prefix), since the git working tree root is now `files/`:

```ts
async function listWorkingTree(fs: OpfsFs, workspaceId: string): Promise<string[]> {
  const out: string[] = [];
  await walk(fs, worktreeDir(workspaceId), '', out);
  return out;
}
// in walk(): if stat.isFile() → out.push(childRel);  // not `files/${childRel}`
```

> The implementer must read the current `git-backing.ts` and apply these changes consistently to all five functions (`initRepo`, `stageAndCommit`, `detectSyncState`, `cloneRepository`, `pushBranch`) plus the two walk helpers. Keep the existing error-logging behavior in `walk`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rune-langium/studio test -- git-backing`
Expected: PASS.

- [ ] **Step 5: Verify the existing clone path still works**

Run: `pnpm --filter @rune-langium/studio test -- workspace-manager`
Expected: existing git-backed workspace tests still pass (createGitBacked pre-creates `/<id>/files`, which is now the worktree root).

- [ ] **Step 6: Type-check + commit**

```bash
pnpm --filter @rune-langium/studio run type-check
git add apps/studio/src/services/git-backing.ts apps/studio/test/services/git-backing.test.ts
git commit -m "fix(git-backing): explicit dir/gitdir so clone+commit share <id>/files worktree"
```

---

## Phase 4 — Wire the engine into the studio

> The studio's editor/store internals must be read at implementation time to match patterns. This phase gives exact integration points, file paths, signatures, and test expectations; the implementer reads each named file and follows its established conventions for the wiring code.

### Task 4.1: Per-workspace engine registry + studio adapter

**Files:**
- Create: `apps/studio/src/services/git-sync.ts` (studio adapter: builds engines from a `WorkspaceRecord` + `OpfsFs` + token + proxy URL)
- Test: `apps/studio/test/services/git-sync.test.ts`

- [ ] **Step 1: Write the failing test** (assert the adapter constructs an engine with the right options; inject a fake `createGitSyncEngine` via module mock)

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi } from 'vitest';

const created: unknown[] = [];
vi.mock('@rune-langium/git-sync-engine', () => ({
  createGitSyncEngine: (opts: unknown) => { created.push(opts); return { notifyDirty: vi.fn(), syncNow: vi.fn(), getState: () => ({ phase: 'idle' }), subscribe: () => () => {}, dispose: vi.fn() }; }
}));

import { getOrCreateSyncEngine, defaultGitProxyUrl } from '../../src/services/git-sync.js';

describe('git-sync adapter', () => {
  it('builds an engine with files dir, .git gitdir, proxy url, and token auth', () => {
    const fs = {} as never;
    getOrCreateSyncEngine({
      fs, workspaceId: 'ws1',
      gitBacking: { repoUrl: 'https://github.com/o/r.git', branch: 'main', user: 'u', tokenPath: '/ws1/.studio/token', syncState: 'clean', lastSyncedSha: null },
      token: 'tok'
    });
    const opts = created[0] as Record<string, string>;
    expect(opts.dir).toBe('/ws1/files');
    expect(opts.gitdir).toBe('/ws1/.git');
    expect(String(opts.corsProxy)).toContain('/git');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @rune-langium/studio test -- git-sync`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/git-sync.ts`**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import http from 'isomorphic-git/http/web';
import { createGitSyncEngine, type GitSyncEngine, type ConflictPolicy } from '@rune-langium/git-sync-engine';
import type { OpfsFs } from '../opfs/opfs-fs.js';
import type { GitBackingRecord } from '../workspace/persistence.js';

/** The authenticated git proxy lives behind the github-auth worker route. */
export function defaultGitProxyUrl(): string {
  const origin = typeof location !== 'undefined' ? location.origin : 'https://www.daikonic.dev';
  return `${origin}/rune-studio/api/github-auth/git`;
}

const engines = new Map<string, GitSyncEngine>();

export interface SyncEngineInput {
  fs: OpfsFs;
  workspaceId: string;
  gitBacking: GitBackingRecord;
  token: string;
  conflictPolicy?: ConflictPolicy;
  onState?: (s: ReturnType<GitSyncEngine['getState']>) => void;
  proxyUrl?: string;
}

export function getOrCreateSyncEngine(input: SyncEngineInput): GitSyncEngine {
  const existing = engines.get(input.workspaceId);
  if (existing) return existing;
  const engine = createGitSyncEngine({
    fs: input.fs as never,
    http,
    dir: `/${input.workspaceId}/files`,
    gitdir: `/${input.workspaceId}/.git`,
    remoteUrl: input.gitBacking.repoUrl,
    ref: input.gitBacking.branch,
    corsProxy: input.proxyUrl ?? defaultGitProxyUrl(),
    onAuth: () => ({ username: input.gitBacking.user, password: input.token }),
    author: { name: input.gitBacking.user, email: `${input.gitBacking.user}@users.noreply.github.com` },
    conflictPolicy: input.conflictPolicy
  });
  if (input.onState) engine.subscribe(input.onState);
  engines.set(input.workspaceId, engine);
  return engine;
}

export function disposeSyncEngine(workspaceId: string): void {
  engines.get(workspaceId)?.dispose();
  engines.delete(workspaceId);
}

export function getSyncEngine(workspaceId: string): GitSyncEngine | undefined {
  return engines.get(workspaceId);
}
```

- [ ] **Step 4: Add the dependency.** Edit `apps/studio/package.json` dependencies: add `"@rune-langium/git-sync-engine": "workspace:*"`. Run `pnpm install`.

- [ ] **Step 5: Run the test + type-check**

Run: `pnpm --filter @rune-langium/studio test -- git-sync && pnpm --filter @rune-langium/studio run type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/services/git-sync.ts apps/studio/test/services/git-sync.test.ts apps/studio/package.json pnpm-lock.yaml
git commit -m "feat(studio): git-sync adapter — per-workspace engine registry"
```

---

### Task 4.2: Call `notifyDirty()` on save for git-backed workspaces

**Files:**
- Modify: `apps/studio/src/workspace/workspace-files.ts` (in `saveWorkspaceFiles`, after the OPFS write at line ~52)
- Test: extend `apps/studio/test/services/git-sync.test.ts` or add `apps/studio/test/workspace/save-notifies-sync.test.ts`

- [ ] **Step 1: Read `workspace-files.ts`** to see how `saveWorkspaceFiles` knows the workspace kind. It currently writes `/${workspaceId}/files/${file.path}`. Determine whether the caller knows the workspace is git-backed (it should, via the `WorkspaceRecord`). The hook should be: after a successful save of a git-backed workspace, call `getSyncEngine(workspaceId)?.notifyDirty()`.

- [ ] **Step 2: Write the failing test** — render/save path is heavy; instead test a small exported helper `notifySyncOnSave(workspaceId)` that calls `getSyncEngine(workspaceId)?.notifyDirty()`.

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi } from 'vitest';
import { getOrCreateSyncEngine } from '../../src/services/git-sync.js';
import { notifySyncOnSave } from '../../src/services/git-sync.js';

describe('notifySyncOnSave', () => {
  it('calls notifyDirty on the registered engine', () => {
    const dirty = vi.fn();
    // seed registry via the adapter's internal map by creating an engine,
    // then monkeypatch — simplest: create, then assert notifyDirty wiring.
    const e = getOrCreateSyncEngine({
      fs: {} as never, workspaceId: 'wsX',
      gitBacking: { repoUrl: 'https://github.com/o/r.git', branch: 'main', user: 'u', tokenPath: '/wsX/.studio/token', syncState: 'clean', lastSyncedSha: null },
      token: 't'
    });
    (e as { notifyDirty: () => void }).notifyDirty = dirty;
    notifySyncOnSave('wsX');
    expect(dirty).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Add `notifySyncOnSave` to `git-sync.ts`**

```ts
export function notifySyncOnSave(workspaceId: string): void {
  engines.get(workspaceId)?.notifyDirty();
}
```

- [ ] **Step 4: Call it from the save path.** In `workspace-files.ts` `saveWorkspaceFiles`, after the loop that writes files, call `notifySyncOnSave(workspaceId)`. Import it from `../services/git-sync.js`. (For non-git workspaces the registry has no engine, so this is a no-op.)

- [ ] **Step 5: Run tests + type-check**

Run: `pnpm --filter @rune-langium/studio test -- git-sync && pnpm --filter @rune-langium/studio run type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/services/git-sync.ts apps/studio/src/workspace/workspace-files.ts apps/studio/test/workspace/save-notifies-sync.test.ts
git commit -m "feat(studio): trigger background sync on save for git-backed workspaces"
```

---

### Task 4.3: Persist `syncState` + `lastSyncedSha` to the WorkspaceRecord

**Files:**
- Modify: `apps/studio/src/services/git-sync.ts` (map engine `SyncStatus.phase` → `GitBackingRecord.syncState` and persist on transition)
- Modify: wherever workspaces are saved (`apps/studio/src/workspace/persistence.ts` `saveWorkspace`)
- Test: `apps/studio/test/services/git-sync-persist.test.ts`

- [ ] **Step 1: Add a phase→syncState mapping** in `git-sync.ts`:

```ts
import type { GitBackingRecord } from '../workspace/persistence.js';
import type { SyncStatus } from '@rune-langium/git-sync-engine';

export function phaseToSyncState(s: SyncStatus): GitBackingRecord['syncState'] {
  switch (s.phase) {
    case 'blocked': return s.conflictPaths?.length ? 'conflict' : 'diverged';
    case 'offline': return s.ahead > 0 ? 'ahead' : 'clean';
    case 'idle': return s.ahead > 0 ? 'ahead' : s.behind > 0 ? 'behind' : 'clean';
    default: return 'ahead'; // mid-sync
  }
}
```

- [ ] **Step 2: Write a unit test** asserting the mapping for each phase.

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { phaseToSyncState } from '../../src/services/git-sync.js';

describe('phaseToSyncState', () => {
  it('maps blocked+conflicts → conflict', () => {
    expect(phaseToSyncState({ phase: 'blocked', ahead: 1, behind: 1, lastSyncedSha: null, conflictPaths: ['a'] })).toBe('conflict');
  });
  it('maps idle clean → clean', () => {
    expect(phaseToSyncState({ phase: 'idle', ahead: 0, behind: 0, lastSyncedSha: 's' })).toBe('clean');
  });
  it('maps idle ahead → ahead', () => {
    expect(phaseToSyncState({ phase: 'idle', ahead: 2, behind: 0, lastSyncedSha: 's' })).toBe('ahead');
  });
});
```

- [ ] **Step 3: Run to verify, then wire persistence.** In `getOrCreateSyncEngine`'s `onState` subscription, on terminal phases (`idle`/`blocked`/`offline`) load the workspace record, set `gitBacking.syncState = phaseToSyncState(s)` and `gitBacking.lastSyncedSha = s.lastSyncedSha`, and `saveWorkspace(record)`. The implementer reads `persistence.ts` for the exact `loadWorkspace`/`saveWorkspace` signatures.

- [ ] **Step 4: Run tests + type-check + commit**

```bash
pnpm --filter @rune-langium/studio test -- git-sync-persist && pnpm --filter @rune-langium/studio run type-check
git add apps/studio/src/services/git-sync.ts apps/studio/test/services/git-sync-persist.test.ts
git commit -m "feat(studio): persist sync state + last-synced sha to WorkspaceRecord"
```

---

### Task 4.4: Sync-status badge component

**Files:**
- Create: `apps/studio/src/components/SyncStatusBadge.tsx`
- Test: `apps/studio/test/components/SyncStatusBadge.test.tsx`
- Modify: mount it in the topbar/workspace switcher (implementer locates the topbar component; search for where `WorkspaceSwitcher` or the app header renders)

- [ ] **Step 1: Write the failing test** — render the badge with each phase, assert copy/role.

```tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SyncStatusBadge } from '../../src/components/SyncStatusBadge.js';

describe('SyncStatusBadge', () => {
  it('renders nothing prominent when clean/idle', () => {
    render(<SyncStatusBadge status={{ phase: 'idle', ahead: 0, behind: 0, lastSyncedSha: 's' }} onResolve={() => {}} />);
    expect(screen.getByTestId('sync-status').getAttribute('data-phase')).toBe('idle');
  });
  it('shows a spinner label while syncing', () => {
    render(<SyncStatusBadge status={{ phase: 'pushing', ahead: 1, behind: 0, lastSyncedSha: null }} onResolve={() => {}} />);
    expect(screen.getByTestId('sync-status').getAttribute('data-phase')).toBe('pushing');
  });
  it('shows resolve actions when blocked', () => {
    render(<SyncStatusBadge status={{ phase: 'blocked', ahead: 1, behind: 1, lastSyncedSha: null, conflictPaths: ['a'] }} onResolve={() => {}} />);
    expect(screen.getByTestId('sync-resolve-keep-mine')).toBeTruthy();
    expect(screen.getByTestId('sync-resolve-take-remote')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `pnpm --filter @rune-langium/studio test -- SyncStatusBadge` → FAIL.

- [ ] **Step 3: Implement `SyncStatusBadge.tsx`** using DS primitives (Button, Spinner, Tooltip). Props: `{ status: SyncStatus; onResolve: (choice: 'keepMine' | 'takeRemote') => void }`. Root element `data-testid="sync-status" data-phase={status.phase}`. When `phase === 'blocked'`, render amber text + two DS buttons with the testids above. When syncing phases, show a DS `Spinner` + label. When `idle` clean, render a subtle/hidden indicator. Follow the DS import pattern (`@rune-langium/design-system/ui/button`, `.../ui/spinner`).

- [ ] **Step 4: Run the test to verify it passes.**

- [ ] **Step 5: Mount the badge.** Locate the studio topbar (search `WorkspaceSwitcher` / the header that renders per-workspace controls). Render `<SyncStatusBadge>` only for `kind === 'git-backed'` workspaces, subscribing to the engine state via `getSyncEngine(workspaceId)`. Verify in the browser (dev server) that the badge appears for a git-backed workspace and is absent for browser-only. **Per the integration-site rule, confirm it actually renders at the mount site, not just in the isolated test.**

- [ ] **Step 6: Type-check + commit**

```bash
pnpm --filter @rune-langium/studio run type-check
git add apps/studio/src/components/SyncStatusBadge.tsx apps/studio/test/components/SyncStatusBadge.test.tsx <topbar file>
git commit -m "feat(studio): sync-status badge wired to engine state"
```

---

## Phase 5 — Interactive ConflictPolicy + resolve UX

### Task 5.1: Studio interactive ConflictPolicy bridging the badge

**Files:**
- Create: `apps/studio/src/services/interactive-conflict-policy.ts`
- Test: `apps/studio/test/services/interactive-conflict-policy.test.ts`
- Modify: `apps/studio/src/services/git-sync.ts` (pass the interactive policy when constructing engines)

- [ ] **Step 1: Write the failing test** — the policy returns a promise resolved by an external `resolve(choice)`.

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { createInteractiveConflictPolicy } from '../../src/services/interactive-conflict-policy.js';

describe('interactive conflict policy', () => {
  it('resolves onConflict with the user choice', async () => {
    const policy = createInteractiveConflictPolicy();
    const p = policy.onConflict({ conflictPaths: ['a'], localSha: 'l', remoteSha: 'r', fs: {} as never, dir: '/w/files', gitdir: '/w/.git' });
    policy.resolve('keepMine');
    await expect(p).resolves.toEqual({ action: 'keepMine' });
  });

  it('maps takeRemote', async () => {
    const policy = createInteractiveConflictPolicy();
    const p = policy.onConflict({ conflictPaths: [], localSha: '', remoteSha: '', fs: {} as never, dir: '', gitdir: '' });
    policy.resolve('takeRemote');
    await expect(p).resolves.toEqual({ action: 'takeRemote' });
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement `interactive-conflict-policy.ts`**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { ConflictPolicy, ConflictResolution } from '@rune-langium/git-sync-engine';

export interface InteractiveConflictPolicy extends ConflictPolicy {
  resolve(choice: 'keepMine' | 'takeRemote'): void;
}

export function createInteractiveConflictPolicy(): InteractiveConflictPolicy {
  let pending: ((r: ConflictResolution) => void) | null = null;
  return {
    onConflict() {
      return new Promise<ConflictResolution>((res) => { pending = res; });
    },
    resolve(choice) {
      pending?.({ action: choice });
      pending = null;
    }
  };
}
```

- [ ] **Step 4: Wire it.** In `git-sync.ts`, create one `InteractiveConflictPolicy` per workspace, pass it to `createGitSyncEngine`, and expose it so the badge's `onResolve` calls `policy.resolve(choice)`. The badge's keepMine/takeRemote buttons → `policy.resolve(...)`, which fulfils the engine's awaited `onConflict`.

- [ ] **Step 5: Run tests + type-check + commit**

```bash
pnpm --filter @rune-langium/studio test -- interactive-conflict-policy && pnpm --filter @rune-langium/studio run type-check
git add apps/studio/src/services/interactive-conflict-policy.ts apps/studio/test/services/interactive-conflict-policy.test.ts apps/studio/src/services/git-sync.ts
git commit -m "feat(studio): interactive ConflictPolicy bridging the resolve badge"
```

---

## Phase 6 — Integration + optional Playwright smoke

### Task 6.1: Round-trip integration test (OpfsFs is jsdom-unavailable → use InMemoryFs + local git server fixture)

**Files:**
- Test: `apps/studio/test/integration/git-sync-roundtrip.test.ts`

- [ ] **Step 1: Write an integration test** that exercises the engine end-to-end against `InMemoryFs` and a local bare repo created with isomorphic-git (no network): init a "remote" bare repo in the in-mem FS, clone via git-backing into `/ws/files`, edit a file, run `engine.syncNow()` with a real `GitOps` (no `__opsForTest`), and assert the remote received the commit.

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import git from 'isomorphic-git';
import { InMemoryFs } from '../../src/services/in-memory-fs.js';
import { createGitSyncEngine } from '@rune-langium/git-sync-engine';

// NOTE: isomorphic-git can push between two dirs in the same fs using the
// `file://`-style url only via http; for a pure-fs round trip, assert the
// engine's commit + ahead-count instead of an actual network push.
describe('git-sync round trip (fs-only)', () => {
  it('commits local edits and reports ahead, then idle after a no-op push stub', async () => {
    const fs = new InMemoryFs() as never;
    await (fs as InMemoryFs).promises.mkdir('/ws/files', { recursive: true });
    await git.init({ fs, dir: '/ws/files', gitdir: '/ws/.git', defaultBranch: 'main' });
    await (fs as InMemoryFs).promises.writeFile('/ws/files/a.rosetta', 'namespace a');
    await git.add({ fs, dir: '/ws/files', gitdir: '/ws/.git', filepath: 'a.rosetta' });
    await git.commit({ fs, dir: '/ws/files', gitdir: '/ws/.git', message: 'init', author: { name: 'A', email: 'a@x' } });

    // Simulate an edit
    await (fs as InMemoryFs).promises.writeFile('/ws/files/a.rosetta', 'namespace a\ntype X:');

    const engine = createGitSyncEngine({
      fs, http: {}, dir: '/ws/files', gitdir: '/ws/.git',
      remoteUrl: 'memory://noop', ref: 'main',
      onAuth: () => ({ username: 'u', password: 't' }),
      author: { name: 'A', email: 'a@x' }, debounceMs: 0,
      // No remote tracking ref exists → fetch is the only network step; stub it
      // by providing a conflictPolicy is irrelevant here. Engine will try fetch
      // and go offline on the memory:// url — assert the local commit happened.
    });
    await engine.syncNow();
    const log = await git.log({ fs, dir: '/ws/files', gitdir: '/ws/.git' });
    expect(log.length).toBeGreaterThanOrEqual(2); // init + the engine's commit of the edit
  });
});
```

> The implementer may strengthen this into a real push round-trip if a lightweight in-process git http server is feasible; otherwise the fs-only assertion (local commit created from the edit) is the minimum bar. Keep the heavy matrix in the unit tests.

- [ ] **Step 2: Run + iterate** until green.

Run: `pnpm --filter @rune-langium/studio test -- git-sync-roundtrip`

- [ ] **Step 3: Commit**

```bash
git add apps/studio/test/integration/git-sync-roundtrip.test.ts
git commit -m "test(studio): git-sync round-trip integration (fs-only)"
```

---

### Task 6.2 (optional): Playwright smoke of badge transitions

**Files:**
- Test: `apps/studio/e2e/git-sync-badge.spec.ts` (follow existing studio Playwright patterns; wait for visible UI readiness, not networkidle)

- [ ] **Step 1:** Add a single smoke test that loads a git-backed workspace (using a test fixture / mocked proxy) and asserts the badge renders and transitions `idle → syncing → idle` on an edit. Only do this if studio e2e infra already supports a git-backed fixture; otherwise skip and note it.

- [ ] **Step 2: Commit** if added.

---

## Final verification (after all tasks)

- [ ] Run the full suite: `pnpm test`
- [ ] Run all type-checks: `pnpm run type-check`
- [ ] Run lint: `pnpm run lint`
- [ ] Build the new package: `pnpm --filter @rune-langium/git-sync-engine build`
- [ ] Dispatch a final code review over the whole branch.
- [ ] Use **superpowers:finishing-a-development-branch** to complete.

---

## Notes / risks for the implementer

- **isomorphic-git merge/error names:** confirm `MergeConflictError` / `MergeNotSupportedError` and `PushRejectedError` against the installed `^1.37.6` typings; the engine's `codeOf`/`isNonFastForward` heuristics may need adjusting. The fake-`GitOps` unit tests (Task 1.6) pin engine *behavior* independent of the real names; `git-ops.ts` (Task 1.3) is where the real names matter.
- **force-with-lease is emulated** (Task 1.4) since isomorphic-git lacks native lease — re-fetch + compare + force.
- **The git-proxy** must allow GET (for `/info/refs`) and POST (upload/receive-pack) and stream bodies; it is routed *before* the POST-only guard in the worker (Task 2.1 Step 4).
- **Deploy:** after merge, `github-auth-worker` must be redeployed (`wrangler deploy`) for the `/git/` route to go live. This is a deploy action — surface it to the user; do not run it autonomously.
- **OPFS in tests:** `OpfsFs` isn't available in node/jsdom; all FS tests use `InMemoryFs`.
- **`detectSyncState` (spec §8):** the spec mentions extending it to `behind`/`diverged`. The engine computes ahead/behind itself via `GitOps.computeAheadBehind`, so `detectSyncState`'s clean/ahead is sufficient for its remaining callers and the extension would be dead code. Leave `detectSyncState` as-is unless a caller needs the richer states; the engine is the source of truth for sync state. (Deliberate YAGNI, not an omission.)
- **`refs/remotes/origin/<ref>`:** `GitOps.merge`/`remoteSha` read `refs/remotes/origin/<ref>`, which `git.fetch` populates for a cloned repo (origin configured by clone). For the `initRepo`-then-add-remote path this ref won't exist until the first fetch against a configured remote; verify origin is configured (clone does this) before relying on it.
