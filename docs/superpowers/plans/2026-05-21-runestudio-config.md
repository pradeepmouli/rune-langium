# `.runestudio/` Repo-Persisted Project Config — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a project's shared studio settings (curated-model deps, sync prefs, project metadata, codegen options) in a committed `/<id>/files/.runestudio/config.json` that round-trips via the merged git-sync engine, so cloning the repo (or opening it on another machine) restores them.

**Architecture:** A studio-local Zod-validated config module reads/writes the file inside the git working tree; for git-backed workspaces the file is the source of truth and the IndexedDB `WorkspaceRecord` is a cache. Open (and post-pull) hydrates file→IDB; settings changes write file + IDB then `notifySyncOnSave` so the existing engine commits/pushes. Token is never written; personal UI state (layout/tabs/expansion) stays IDB-only.

**Tech Stack:** TypeScript ESM, Zod v4, `idb`, OPFS (`OpfsFs`/`InMemoryFs`), the merged `@rune-langium/git-sync-engine` + `apps/studio/src/services/git-sync.ts`, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-05-21-runestudio-config-design.md`

**Conventions (every task):**
- All new files under `apps/studio/` carry the header: `// SPDX-License-Identifier: FSL-1.1-ALv2` then `// Copyright (c) 2026 Pradeep Mouli`.
- ESM `.js` import extensions. Tests are `apps/studio/test/**/*.test.ts(x)`, run with `vitest run` (the studio runner often runs the whole suite regardless of a name filter — that's fine; confirm the suite stays green).
- Commit after each task; do NOT use `--no-verify`. Prefix commits with `SKIP_SIMPLE_GIT_HOOKS=1` to skip the slow pre-push hook.
- `InMemoryFs` (`apps/studio/src/services/in-memory-fs.ts`) is the FS for unit tests (OPFS is unavailable in node/jsdom).

---

## Task 1: `runestudio-config.ts` — schema + read/write

**Files:**
- Create: `apps/studio/src/workspace/runestudio-config.ts`
- Test: `apps/studio/test/workspace/runestudio-config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { InMemoryFs } from '../../src/services/in-memory-fs.js';
import {
  RuneStudioConfigSchema,
  readRuneStudioConfig,
  writeRuneStudioConfig,
  CONFIG_PATH
} from '../../src/workspace/runestudio-config.js';

function fsFor(): InMemoryFs {
  return new InMemoryFs();
}

describe('runestudio-config', () => {
  it('CONFIG_PATH is under files/.runestudio (in the working tree)', () => {
    expect(CONFIG_PATH('ws1')).toBe('/ws1/files/.runestudio/config.json');
  });

  it('returns null when the file is absent', async () => {
    const fs = fsFor();
    expect(await readRuneStudioConfig(fs as never, 'ws1')).toBeNull();
  });

  it('round-trips a valid config', async () => {
    const fs = fsFor();
    const cfg = { version: 1 as const, project: { name: 'Acme CDM' }, sync: { autoSync: true } };
    await writeRuneStudioConfig(fs as never, 'ws1', cfg);
    const read = await readRuneStudioConfig(fs as never, 'ws1');
    expect(read?.project?.name).toBe('Acme CDM');
    expect(read?.sync?.autoSync).toBe(true);
  });

  it('returns null (no throw) on malformed JSON', async () => {
    const fs = fsFor();
    await fs.promises.mkdir('/ws1/files/.runestudio', { recursive: true });
    await fs.promises.writeFile('/ws1/files/.runestudio/config.json', '{ not json');
    expect(await readRuneStudioConfig(fs as never, 'ws1')).toBeNull();
  });

  it('returns null on a structurally-invalid config (Zod reject)', async () => {
    const fs = fsFor();
    await fs.promises.mkdir('/ws1/files/.runestudio', { recursive: true });
    await fs.promises.writeFile('/ws1/files/.runestudio/config.json', JSON.stringify({ version: 99, sync: 'nope' }));
    expect(await readRuneStudioConfig(fs as never, 'ws1')).toBeNull();
  });

  it('preserves unknown top-level keys on rewrite (forward-compat)', async () => {
    const fs = fsFor();
    await fs.promises.mkdir('/ws1/files/.runestudio', { recursive: true });
    await fs.promises.writeFile(
      '/ws1/files/.runestudio/config.json',
      JSON.stringify({ version: 1, futureField: { a: 1 }, project: { name: 'old' } })
    );
    // merge a patch over the existing file
    const existing = (await readRuneStudioConfig(fs as never, 'ws1')) ?? { version: 1 as const };
    await writeRuneStudioConfig(fs as never, 'ws1', { ...existing, project: { name: 'new' } });
    const raw = JSON.parse(
      (await fs.promises.readFile('/ws1/files/.runestudio/config.json', 'utf8')) as string
    );
    expect(raw.futureField).toEqual({ a: 1 }); // unknown key preserved
    expect(raw.project.name).toBe('new');
  });

  it('never serializes a token-shaped secret', async () => {
    const fs = fsFor();
    await writeRuneStudioConfig(fs as never, 'ws1', { version: 1 as const, project: { name: 'x' } });
    const raw = (await fs.promises.readFile('/ws1/files/.runestudio/config.json', 'utf8')) as string;
    expect(raw).not.toMatch(/ghp_|gho_|token/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rune-langium/studio test -- runestudio-config`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `apps/studio/src/workspace/runestudio-config.ts`**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * `.runestudio/config.json` — committed, repo-persisted project config for
 * git-backed workspaces. Lives inside the git working tree
 * (`/<id>/files/.runestudio/config.json`) so the git-sync engine commits and
 * pushes it like any file. The GitHub token is NEVER written here (it stays
 * in OPFS `/<id>/.studio/`, outside the working tree); the schema has no
 * secret field by construction.
 *
 * See docs/superpowers/specs/2026-05-21-runestudio-config-design.md.
 */

import { z } from 'zod';
import type { OpfsFs } from '../opfs/opfs-fs.js';

export const RuneStudioConfigSchema = z
  .object({
    version: z.literal(1),
    project: z
      .object({ name: z.string().optional(), description: z.string().optional() })
      .optional(),
    curatedModels: z
      .array(z.object({ modelId: z.string(), version: z.string() }))
      .optional(),
    sync: z
      .object({
        autoSync: z.boolean().optional(),
        debounceMs: z.number().int().positive().optional(),
        branch: z.string().optional()
      })
      .optional(),
    codegen: z
      .object({
        target: z.string(),
        layout: z.string().optional(),
        namespaces: z.array(z.string()).optional(),
        options: z.record(z.string(), z.unknown()).optional()
      })
      .optional()
  })
  .passthrough(); // preserve unknown top-level keys written by a newer studio

export type RuneStudioConfig = z.infer<typeof RuneStudioConfigSchema>;

/** Absolute OPFS path of the config file for a workspace (inside the working tree). */
export function CONFIG_PATH(workspaceId: string): string {
  return `/${workspaceId}/files/.runestudio/config.json`;
}

/**
 * Read + validate the config. Returns `null` when absent OR when the content
 * is malformed/invalid — callers fall back to IDB/defaults. Never throws and
 * never overwrites; an invalid file may be a newer version we don't
 * understand, so it is left untouched.
 */
export async function readRuneStudioConfig(
  fs: OpfsFs,
  workspaceId: string
): Promise<RuneStudioConfig | null> {
  let raw: string;
  try {
    const v = await fs.readFile(CONFIG_PATH(workspaceId), 'utf8');
    raw = typeof v === 'string' ? v : new TextDecoder().decode(v);
  } catch {
    return null; // absent
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // eslint-disable-next-line no-console
    console.warn('[runestudio-config] malformed JSON; ignoring', workspaceId);
    return null;
  }
  const result = RuneStudioConfigSchema.safeParse(parsed);
  if (!result.success) {
    // eslint-disable-next-line no-console
    console.warn('[runestudio-config] invalid config; ignoring', result.error.issues);
    return null;
  }
  return result.data;
}

/**
 * Write the config, MERGING over any existing file so unknown top-level keys
 * (forward-compat) are preserved. Creates `.runestudio/` if needed.
 */
export async function writeRuneStudioConfig(
  fs: OpfsFs,
  workspaceId: string,
  config: RuneStudioConfig
): Promise<void> {
  let existing: Record<string, unknown> = {};
  try {
    const v = await fs.readFile(CONFIG_PATH(workspaceId), 'utf8');
    const raw = typeof v === 'string' ? v : new TextDecoder().decode(v);
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      existing = parsed as Record<string, unknown>;
    }
  } catch {
    /* absent or unreadable — start fresh */
  }
  const merged = { ...existing, ...config };
  await fs.mkdir(`/${workspaceId}/files/.runestudio`);
  await fs.writeFile(CONFIG_PATH(workspaceId), JSON.stringify(merged, null, 2) + '\n');
}
```

> Note: `OpfsFs.mkdir` is mkdir-p / idempotent (same as used by `git-backing.ts`); `InMemoryFs.promises.mkdir` accepts `{recursive}` but `OpfsFs.mkdir` takes only a path — call it without options as shown. Confirm the `OpfsFs` method signatures (`readFile(path, 'utf8')`, `writeFile`, `mkdir`) against `apps/studio/src/opfs/opfs-fs.ts` and adjust the calls if they differ (the test uses `InMemoryFs` which exposes `.promises.*`; the production module uses `OpfsFs`'s direct methods — verify both shapes line up, mirroring how `git-backing.ts`/`dirty-buffer.ts` call `fs.readFile`/`fs.writeFile`/`fs.mkdir`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rune-langium/studio test -- runestudio-config`
Expected: all pass.

- [ ] **Step 5: Type-check + commit**

```bash
pnpm --filter @rune-langium/studio run type-check
git add apps/studio/src/workspace/runestudio-config.ts apps/studio/test/workspace/runestudio-config.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(studio): .runestudio/config.json schema + read/write"
```

---

## Task 2: `updateProjectConfig` — write file + IDB cache + notify sync

**Files:**
- Create: `apps/studio/src/workspace/project-config.ts` (orchestration; kept separate from `runestudio-config.ts`'s schema/IO so each file has one responsibility)
- Test: `apps/studio/test/workspace/project-config.test.ts`

- [ ] **Step 1: Read** `apps/studio/src/workspace/persistence.ts` for the exact `loadWorkspace(id)` / `saveWorkspace(ws)` signatures and the `WorkspaceRecord` git-backed variant, and `apps/studio/src/services/git-sync.ts` for `notifySyncOnSave(id)`. Also note `WorkspaceManager.getFs()` returns the `OpfsFs`.

- [ ] **Step 2: Write the failing test**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryFs } from '../../src/services/in-memory-fs.js';

const notifySpy = vi.fn();
vi.mock('../../src/services/git-sync.js', () => ({ notifySyncOnSave: (id: string) => notifySpy(id) }));

const saved: unknown[] = [];
const records = new Map<string, unknown>();
vi.mock('../../src/workspace/persistence.js', () => ({
  loadWorkspace: async (id: string) => records.get(id),
  saveWorkspace: async (ws: { id: string }) => { records.set(ws.id, ws); saved.push(ws); }
}));

import { updateProjectConfig } from '../../src/workspace/project-config.js';
import { readRuneStudioConfig } from '../../src/workspace/runestudio-config.js';

beforeEach(() => { notifySpy.mockClear(); saved.length = 0; records.clear(); });

describe('updateProjectConfig', () => {
  it('writes the file, updates the IDB record, and notifies sync', async () => {
    const fs = new InMemoryFs();
    records.set('ws1', { id: 'ws1', kind: 'git-backed', curatedModels: [], gitBacking: { branch: 'main' } });
    await updateProjectConfig(fs as never, 'ws1', { sync: { autoSync: false } });
    // file written
    const cfg = await readRuneStudioConfig(fs as never, 'ws1');
    expect(cfg?.sync?.autoSync).toBe(false);
    // IDB updated + sync notified
    expect(saved.length).toBe(1);
    expect(notifySpy).toHaveBeenCalledWith('ws1');
  });

  it('is a no-op for a non-git-backed workspace', async () => {
    const fs = new InMemoryFs();
    records.set('ws2', { id: 'ws2', kind: 'browser-only', curatedModels: [] });
    await updateProjectConfig(fs as never, 'ws2', { project: { name: 'x' } });
    expect(await readRuneStudioConfig(fs as never, 'ws2')).toBeNull(); // no file written
    expect(notifySpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @rune-langium/studio test -- project-config`
Expected: FAIL — `updateProjectConfig` not found.

- [ ] **Step 4: Implement `apps/studio/src/workspace/project-config.ts`**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Orchestration for the shared project config: applies a patch to
 * `.runestudio/config.json`, mirrors it into the IndexedDB WorkspaceRecord
 * cache, and nudges the git-sync engine to commit/push. Git-backed only.
 */

import type { OpfsFs } from '../opfs/opfs-fs.js';
import { loadWorkspace, saveWorkspace } from './persistence.js';
import { notifySyncOnSave } from '../services/git-sync.js';
import {
  readRuneStudioConfig,
  writeRuneStudioConfig,
  type RuneStudioConfig
} from './runestudio-config.js';

export type ProjectConfigPatch = Partial<Omit<RuneStudioConfig, 'version'>>;

/**
 * Merge `patch` into the workspace's `.runestudio/config.json`, update the
 * IDB cache, and notify sync. No-op for non-git-backed workspaces (no remote
 * to round-trip to).
 */
export async function updateProjectConfig(
  fs: OpfsFs,
  workspaceId: string,
  patch: ProjectConfigPatch
): Promise<void> {
  const ws = await loadWorkspace(workspaceId);
  if (!ws || ws.kind !== 'git-backed') return;

  const current = (await readRuneStudioConfig(fs, workspaceId)) ?? { version: 1 as const };
  const next: RuneStudioConfig = { ...current, ...patch, version: 1 };
  await writeRuneStudioConfig(fs, workspaceId, next);

  // Mirror into the IDB cache so existing read sites stay fast/unchanged.
  applyConfigToRecord(ws, next);
  await saveWorkspace(ws);

  notifySyncOnSave(workspaceId);
}

/**
 * Project the file's shared fields onto the in-memory/IDB WorkspaceRecord.
 * Only the declarative parts are mirrored; per-machine runtime fields
 * (curated `loadedAt`/`updateAvailable`, etc.) are left as-is.
 */
export function applyConfigToRecord(
  ws: { curatedModels?: { modelId: string; loadedVersion: string; loadedAt: string; updateAvailable: boolean }[]; name?: string },
  cfg: RuneStudioConfig
): void {
  if (cfg.project?.name) ws.name = cfg.project.name;
  if (cfg.curatedModels) {
    const existing = new Map((ws.curatedModels ?? []).map((b) => [b.modelId, b]));
    ws.curatedModels = cfg.curatedModels.map((c) => {
      const prior = existing.get(c.modelId);
      return {
        modelId: c.modelId,
        loadedVersion: c.version,
        loadedAt: prior?.loadedAt ?? new Date().toISOString(),
        updateAvailable: prior?.updateAvailable ?? false
      };
    });
  }
  // sync/codegen are consumed directly from the file by their own readers;
  // mirror them onto the record only if/where those consumers read from IDB
  // (wire in Task 5 against the actual consumer shapes).
}
```

> Note: `applyConfigToRecord`'s `ws` parameter type is loose to avoid coupling the helper to the full `WorkspaceRecord` union at this layer; in `updateProjectConfig` it operates on the loaded record. Confirm `CuratedModelBinding` field names (`modelId`, `loadedVersion`, `loadedAt`, `updateAvailable`) against `persistence.ts` and adjust the mapping if they differ.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @rune-langium/studio test -- project-config`
Expected: all pass.

- [ ] **Step 6: Type-check + commit**

```bash
pnpm --filter @rune-langium/studio run type-check
git add apps/studio/src/workspace/project-config.ts apps/studio/test/workspace/project-config.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(studio): updateProjectConfig — write .runestudio + IDB cache + notify sync"
```

---

## Task 3: Hydrate on open

**Files:**
- Create: `apps/studio/src/workspace/hydrate-project-config.ts` (a small function reused by open + post-pull)
- Modify: `apps/studio/src/workspace/workspace-manager.ts` (`open(id)` — call hydrate for git-backed workspaces, ~line 175)
- Test: `apps/studio/test/workspace/hydrate-project-config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { InMemoryFs } from '../../src/services/in-memory-fs.js';
import { writeRuneStudioConfig } from '../../src/workspace/runestudio-config.js';
import { hydrateProjectConfig } from '../../src/workspace/hydrate-project-config.js';

describe('hydrateProjectConfig', () => {
  it('applies the committed config onto a git-backed record', async () => {
    const fs = new InMemoryFs();
    await writeRuneStudioConfig(fs as never, 'ws1', {
      version: 1,
      project: { name: 'Acme CDM' },
      curatedModels: [{ modelId: 'cdm-base', version: '1.2.0' }]
    });
    const ws: any = { id: 'ws1', kind: 'git-backed', name: 'repo', curatedModels: [] };
    const changed = await hydrateProjectConfig(fs as never, ws);
    expect(changed).toBe(true);
    expect(ws.name).toBe('Acme CDM');
    expect(ws.curatedModels[0]).toMatchObject({ modelId: 'cdm-base', loadedVersion: '1.2.0' });
  });

  it('returns false (no change) when no config file exists', async () => {
    const fs = new InMemoryFs();
    const ws: any = { id: 'ws1', kind: 'git-backed', name: 'repo', curatedModels: [] };
    expect(await hydrateProjectConfig(fs as never, ws)).toBe(false);
  });

  it('is a no-op for non-git-backed records', async () => {
    const fs = new InMemoryFs();
    await writeRuneStudioConfig(fs as never, 'ws1', { version: 1, project: { name: 'X' } });
    const ws: any = { id: 'ws1', kind: 'browser-only', name: 'repo', curatedModels: [] };
    expect(await hydrateProjectConfig(fs as never, ws)).toBe(false);
    expect(ws.name).toBe('repo');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rune-langium/studio test -- hydrate-project-config`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `apps/studio/src/workspace/hydrate-project-config.ts`**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Hydrate a git-backed WorkspaceRecord's shared fields FROM the committed
 * `.runestudio/config.json` (file is the source of truth). Mutates `ws` in
 * place; returns whether anything changed. No-op for non-git workspaces or
 * when the file is absent/invalid.
 */

import type { OpfsFs } from '../opfs/opfs-fs.js';
import { readRuneStudioConfig } from './runestudio-config.js';
import { applyConfigToRecord } from './project-config.js';

export async function hydrateProjectConfig(
  fs: OpfsFs,
  ws: { id: string; kind: string } & Record<string, unknown>
): Promise<boolean> {
  if (ws.kind !== 'git-backed') return false;
  const cfg = await readRuneStudioConfig(fs, ws.id);
  if (!cfg) return false;
  applyConfigToRecord(ws as never, cfg);
  return true;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rune-langium/studio test -- hydrate-project-config`
Expected: all pass.

- [ ] **Step 5: Wire into `WorkspaceManager.open`**

Read `workspace-manager.ts` `open(id)` (~line 175). After it loads the record (`const ws = await loadWorkspace(id)`) and before returning it, for a git-backed record call `hydrateProjectConfig(this.getFs(), ws)`; if it returns `true`, persist the updated cache with `saveWorkspace(ws)`. Import `hydrateProjectConfig` + `saveWorkspace`. Keep the existing open behavior (ownership claim, `lastOpenedAt` bump) intact and ordered before/after as appropriate.

- [ ] **Step 6: Type-check + commit**

```bash
pnpm --filter @rune-langium/studio run type-check
git add apps/studio/src/workspace/hydrate-project-config.ts apps/studio/test/workspace/hydrate-project-config.test.ts apps/studio/src/workspace/workspace-manager.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(studio): hydrate .runestudio config on git-backed workspace open"
```

---

## Task 4: Post-pull re-hydrate hook

**Files:**
- Modify: `apps/studio/src/services/git-sync.ts` (the engine `onState` subscription added in the git-sync feature)
- Test: `apps/studio/test/services/git-sync-rehydrate.test.ts`

Goal: when a sync pulls remote changes (engine reaches `idle` with a CHANGED `lastSyncedSha`), re-read `.runestudio/config.json` and re-hydrate the IDB cache, so a teammate's pushed config update reflects locally without a reopen.

- [ ] **Step 1: Read** `git-sync.ts`'s `getOrCreateSyncEngine` internal `onState` handler (the one that persists `syncState`/`lastSyncedSha`). You'll add re-hydration alongside it.

- [ ] **Step 2: Write the failing test** — assert that when the engine emits an `idle` state whose `lastSyncedSha` differs from the previously-seen one, the rehydrate path runs `hydrateProjectConfig` + `saveWorkspace`.

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, beforeEach } from 'vitest';

const hydrateSpy = vi.fn().mockResolvedValue(true);
vi.mock('../../src/workspace/hydrate-project-config.js', () => ({
  hydrateProjectConfig: (...a: unknown[]) => hydrateSpy(...a)
}));
const saved: unknown[] = [];
const rec = { id: 'wsR', kind: 'git-backed', curatedModels: [], gitBacking: { repoUrl: 'u', branch: 'main', user: 'x', tokenPath: '/wsR/.studio/token', syncState: 'clean', lastSyncedSha: null } };
vi.mock('../../src/workspace/persistence.js', () => ({
  loadWorkspace: async () => rec,
  saveWorkspace: async (ws: unknown) => { saved.push(ws); }
}));
vi.mock('@rune-langium/git-sync-engine', () => {
  let cb: ((s: any) => void) | null = null;
  return { createGitSyncEngine: () => ({
    notifyDirty: vi.fn(), syncNow: vi.fn(),
    getState: () => ({ phase: 'idle', ahead: 0, behind: 0, lastSyncedSha: null }),
    subscribe: (c: any) => { cb = c; return () => {}; },
    unsubscribe: vi.fn(), dispose: vi.fn(),
    __emit: (s: any) => cb && cb(s)
  }) };
});

import { getOrCreateSyncEngine } from '../../src/services/git-sync.js';

beforeEach(() => { hydrateSpy.mockClear(); saved.length = 0; });

describe('post-pull re-hydrate', () => {
  it('re-hydrates project config when lastSyncedSha changes on idle', async () => {
    const e = getOrCreateSyncEngine({
      fs: {} as never, workspaceId: 'wsR',
      gitBacking: rec.gitBacking as never, token: 't'
    });
    (e as any) // emit an idle with a new sha (a pull happened)
      ; const engine = e as unknown as { __emit?: (s: unknown) => void };
    // @ts-expect-error test seam
    engine.__emit?.({ phase: 'idle', ahead: 0, behind: 0, lastSyncedSha: 'newsha' });
    await new Promise((r) => setTimeout(r, 0));
    expect(hydrateSpy).toHaveBeenCalled();
  });
});
```

> Note: this test is sensitive to how the engine mock surfaces `__emit` through `getOrCreateSyncEngine`. The implementer may simplify by testing a small extracted `maybeRehydrate(prevSha, state, fs, id)` pure-ish function instead of driving the full subscription — prefer whichever yields a real, non-flaky assertion. The REQUIRED behavior to pin: re-hydrate fires only on a terminal `idle` with a `lastSyncedSha` that changed from the last observed value (not on every emit).

- [ ] **Step 3: Implement** — in `getOrCreateSyncEngine`, track the last-seen `lastSyncedSha` per workspace; in the existing terminal-phase `onState` handler, when `phase === 'idle'` and `state.lastSyncedSha` differs from the last-seen value, call `hydrateProjectConfig(fs, record)` (load the record, hydrate, `saveWorkspace` if changed), then update last-seen. Guard against re-entrancy (don't let a hydrate-triggered save loop). Keep the existing `syncState`/`lastSyncedSha` persistence intact.

- [ ] **Step 4: Run the test + type-check**

Run: `pnpm --filter @rune-langium/studio test -- git-sync-rehydrate && pnpm --filter @rune-langium/studio run type-check`
Expected: pass / exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/services/git-sync.ts apps/studio/test/services/git-sync-rehydrate.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(studio): re-hydrate .runestudio config after a sync pulls remote changes"
```

---

## Task 5: Write-site integration (curated, sync prefs, codegen, metadata)

> The exact call sites depend on current UI/store code; read each before wiring. The contract is uniform: when one of the four shared settings changes for a git-backed workspace, route through `updateProjectConfig(fs, workspaceId, patch)` (which writes the file + IDB + notifies sync) instead of (or in addition to) the current IDB-only write. Verify each at its actual call site — not just in isolation.

**Files (read + modify the real sites):**
- `apps/studio/src/App.tsx` and/or the curated-models handler — curated load/unload → `updateProjectConfig(fs, id, { curatedModels: bindings.map(b => ({ modelId: b.modelId, version: b.loadedVersion })) })`.
- The sync-prefs surface (if none exists yet, this may be deferred — note it) → `{ sync: {...} }`.
- `apps/studio/src/components/DownloadConfigModal.tsx` / `CodePreviewPanel.tsx` — when the user confirms codegen options for a git-backed workspace, persist `{ codegen: { target, layout, namespaces, options } }` (align with the `DownloadConfig` interface at `DownloadConfigModal.tsx:79`).
- Project metadata (rename) → `{ project: { name } }`.

- [ ] **Step 1:** Read each call site. For each of the four, identify where the setting is currently changed/persisted for a git-backed workspace.

- [ ] **Step 2:** Add an integration test per wired site where feasible (mock `updateProjectConfig`, assert it's called with the right patch on the relevant action). Example for curated:

```ts
// assert that loading a curated model in a git-backed workspace calls
// updateProjectConfig with { curatedModels: [{ modelId, version }] }
```

- [ ] **Step 3:** Wire each site to call `updateProjectConfig` (get the `OpfsFs` from the workspace manager / existing context). For git-backed workspaces this both updates IDB (as today) and writes+syncs the file; for non-git workspaces `updateProjectConfig` is a no-op, so existing IDB writes must remain for those (don't remove the current IDB path — `updateProjectConfig` complements it for git-backed, and is a no-op otherwise; ensure non-git still persists via the existing path).

- [ ] **Step 4:** Verify at each mount site in a running dev build that changing the setting on a git-backed workspace writes `.runestudio/config.json` (and the badge eventually shows a sync). Confirm non-git workspaces are unaffected.

- [ ] **Step 5: Run suite + type-check + commit**

```bash
pnpm --filter @rune-langium/studio test && pnpm --filter @rune-langium/studio run type-check
git add -A
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(studio): persist curated/sync/codegen/metadata to .runestudio for git-backed workspaces"
```

---

## Final verification

- [ ] `pnpm --filter @rune-langium/studio test` (full suite green)
- [ ] `pnpm --filter @rune-langium/studio run type-check` (exit 0)
- [ ] `pnpm run lint` (0 errors)
- [ ] Manual: clone a git-backed repo with a `.runestudio/config.json` → open → curated models / codegen options / name hydrate; change a setting → file updates and syncs; open the same repo fresh elsewhere → settings restored.
- [ ] Dispatch a final code review over the branch; then use **superpowers:finishing-a-development-branch** (push + PR, per the user's standing preference — do not merge to master locally).

## Notes / risks for the implementer

- **`OpfsFs` vs `InMemoryFs` method shapes:** tests use `InMemoryFs` (`.promises.*`); production uses `OpfsFs` direct methods. Verify `readFile(path,'utf8')` / `writeFile` / `mkdir` signatures against `opfs-fs.ts` (mirror `git-backing.ts` / `dirty-buffer.ts` usage).
- **Token safety:** the schema has no secret field; the Task 1 test asserts the serialized file never contains a token-shaped string. Keep that test.
- **Non-git workspaces:** `updateProjectConfig`/`hydrateProjectConfig` are no-ops; existing IDB-only persistence for browser-only/folder-backed must remain unchanged.
- **No commit-noise throttle needed:** writes happen only on explicit settings changes; the engine's debounce covers bursts.
- **Re-entrancy (Task 4):** a re-hydrate writes IDB (not the file), so it must not itself trigger `notifySyncOnSave` — only `updateProjectConfig` writes the file. Keep hydrate read-only w.r.t. the file.
