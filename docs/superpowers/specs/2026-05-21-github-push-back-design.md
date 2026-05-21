# GitHub push-back via a generic GitSyncEngine — design

Status: **DRAFT for discussion** · 2026-05-21

## 1. Problem

The studio can already **import** from GitHub: device-flow auth → one-shot
`isomorphic-git` clone into an OPFS workspace (`apps/studio/src/components/
GitHubWorkspaceFlow.tsx` → `WorkspaceManager.createGitBacked` →
`git-backing.ts` `cloneRepository`). It cannot send edits back. We want a
**two-way sync**: edits made in the studio flow back to the source GitHub
repo, transparently, as a side effect of saving.

Two facts from exploring the current code shape the design:

1. **The plumbing mostly exists but is unwired.** `git-backing.ts` already
   exports `stageAndCommit`, `pushBranch` (real `git.push` through a CORS
   proxy), and `detectSyncState`. **Nothing in the UI calls them** — only
   `cloneRepository` is wired.
2. **There is a latent working-tree layout bug.** `createGitBacked` creates
   `/<id>/files/` (the studio's file convention, where the editor reads and
   writes), but `cloneRepository` clones with `dir = /<id>`, so cloned files
   land directly under `/<id>/` and `.git` under `/<id>/.git` — *beside*
   `files/`, not in it. Meanwhile `stageAndCommit` walks `/<id>/files`. The
   clone → edit → commit round-trip has therefore never been closed
   end-to-end. This must be reconciled before push-back can work.

### 1.1 No turnkey library exists

The transport and merge primitives are solved by `isomorphic-git` (already a
dependency): clone/commit/fetch/push, and conflict-aware `merge` that writes
standard `<<<<<<<` markers (`abortOnConflict: false`) or aborts cleanly
(`abortOnConflict: true`), plus pluggable merge drivers. **isomorphic-git has
no `rebase` command** — only `merge`.

What no library provides — and what GitHub Desktop, VS Code's Git
integration, and github.dev all hand-roll — is the **orchestration**:
debounced trigger, a sync state machine, retry/offline handling, and a
conflict policy. That orchestration is generic (not GitHub-, OPFS-, or
React-specific), so it should be built **once, as a standalone package**,
with the studio as its first consumer.

## 2. Goals / Non-goals

**Goals**
- Transparent "save to GitHub": saving in the studio commits + syncs in the
  background; the GitHub mechanics are invisible unless something blocks.
- Two-way sync: pull remote changes (fast-forward or auto-merge) before push.
- Durability: a local commit always precedes any network step, so edits are
  never lost to a network failure — worst case is "committed locally, not
  yet pushed."
- A generic, reusable, independently-testable `GitSyncEngine` package.
- Authenticated git traffic routes through our own Cloudflare Worker, so the
  repo-scoped token never transits a third-party proxy.

**Non-goals (this iteration)**
- Line-level / 3-way conflict resolution UI. On a real conflict we **block**
  and offer coarse "keep mine" / "take remote", deferring an in-editor merge
  surface to a later iteration. (The engine's conflict policy is pluggable so
  this can be added without redesign.)
- Fork-and-PR flow for repos the user lacks push access to.
- Multi-remote, submodules, LFS.

## 3. Decisions (from brainstorming)

| Axis | Decision |
|---|---|
| Sync scope | Full two-way sync (fetch before push) |
| Conflict handling | `ff-or-merge` then **block** on real conflict; no rebase (iso-git has none) |
| Trigger / authoring | Transparent save; auto-generated commit messages; no commit-message prompt |
| `keep mine` | `git push --force-with-lease` to the same branch |
| `take remote` | Reset local working tree + branch to the fetched remote ref |
| Network path | Own Cloudflare Worker git-http proxy (extend `github-auth-worker`) |
| Foundation | `isomorphic-git` + our engine |
| Engine packaging | New monorepo package `packages/git-sync-engine` (MIT) |

## 4. Architecture

```
editor save ──> OPFS write (instant, unchanged)
                    │ notifyDirty()
                    ▼  (debounced ~2-3s)
        ┌───────────────────────────────────────┐
        │  GitSyncEngine  (generic package, MIT) │
        │  idle→committing→fetching→merging→     │
        │       pushing→idle  | blocked | offline│
        └───────────────────────────────────────┘
              │ isomorphic-git (fs, http, corsProxy, onAuth)
              ▼
        git-http proxy Worker  ──>  github.com
        (token attached server-side; origin allowlisted)

        engine state ──> studio sync-status badge
```

- **Instant local save is unchanged.** The editor writes OPFS as today; sync
  is a debounced after-effect, never on the save critical path.
- **The engine is the only net-new "brain."** Everything below it is
  `isomorphic-git`; everything above it is thin studio wiring.

### 4.1 Why a dedicated module (not a React effect / store)

Sync is long-running, retryable, and outlives component lifecycles (tab
focus changes, route changes). Tying it to React effects invites the
cascading-setState bugs already fought elsewhere in this app. The engine is
a plain object with an explicit state machine and an observer API.

## 5. The generic package: `packages/git-sync-engine`

**Dependencies:** `isomorphic-git` only (peer). No React, no OPFS, no GitHub
SDK, no Cloudflare anything.

### 5.1 Public API

```ts
export interface GitSyncEngineOptions {
  fs: IsoGitFs;                 // any isomorphic-git-compatible fs
  http: IsoGitHttp;             // isomorphic-git http client
  dir: string;                  // working tree root
  gitdir: string;              // git object store (explicit — fixes layout bug)
  remoteUrl: string;
  ref: string;                  // branch
  corsProxy?: string;           // proxy/forwarder URL
  onAuth: () => { username: string; password: string }; // token callback
  author: { name: string; email: string };
  debounceMs?: number;          // default 2500
  conflictPolicy?: ConflictPolicy; // default ffOrMergeThenBlock
  generateMessage?: (changed: string[]) => string; // default "Update N files"
}

export interface GitSyncEngine {
  notifyDirty(): void;          // coalesced; schedules a sync
  syncNow(): Promise<SyncStatus>;// manual / retry
  getState(): SyncStatus;
  subscribe(cb: (s: SyncStatus) => void): () => void;
  dispose(): void;
}
```

The engine has **no `resolve()` method**. All human-in-the-loop decisions
flow through the injected `ConflictPolicy` (§5.3), keeping the engine purely
mechanical.

```

export type SyncPhase =
  | 'idle' | 'committing' | 'fetching' | 'merging' | 'pushing'
  | 'blocked' | 'offline';

export interface SyncStatus {
  phase: SyncPhase;
  ahead: number; behind: number;
  lastSyncedSha: string | null;
  lastError?: { code: SyncErrorCode; message: string };
  conflictPaths?: string[];     // populated when phase === 'blocked'
}

export function createGitSyncEngine(o: GitSyncEngineOptions): GitSyncEngine;
```

### 5.2 State machine

```
idle ──notifyDirty/debounce──> committing ──> fetching ──> merging ──> pushing ──> idle
                                                  │              │           │
                                          (network err)   (conflict)  (non-ff: retry once → merging)
                                                  ▼              ▼
                                               offline      [await policy.onConflict]
offline ──onLine / next notifyDirty──> committing                 │
                                                  ┌───────────────┼───────────────┐
                                          'keepMine'         'takeRemote'      'block'
                                       (force-with-lease)  (reset to remote)  (stay blocked)
                                                  ▼               ▼               ▼
                                               pushing          idle           blocked
```

On conflict the engine **awaits `policy.onConflict(ctx)`** and applies
whatever it returns — it does not decide resolution itself. While awaiting,
it emits `phase: 'blocked'` with `conflictPaths` so the consumer's UI can
render the choice; the consumer's policy returns the user's decision.

- **committing:** stage all working-tree changes, commit with the generated
  message. Skipped if nothing is dirty (but a fetch may still run to update
  `behind`).
- **fetching:** `git.fetch` the remote ref; compute ahead/behind.
- **merging:** if remote is ancestor of local → fast-forward, done. Else
  `git.merge({ abortOnConflict: true })`. Clean auto-merge → continue;
  `MergeConflictError`/`MergeNotSupportedError` → `blocked` with
  `conflictPaths`.
- **pushing:** `git.push`. On non-fast-forward rejection, loop back to
  `fetching` **once**; a second failure → `blocked`.

### 5.3 Conflict policy (the resolution authority)

The policy is the **single place** that decides what happens on a conflict.
The engine calls it and applies the returned action; it owns no resolution
logic of its own.

```ts
export interface ConflictContext {
  conflictPaths: string[];
  localSha: string;
  remoteSha: string;
  // Enough handle to let an advanced policy inspect/rewrite the tree
  // (e.g. write conflict markers) before returning a decision.
  fs: IsoGitFs; dir: string; gitdir: string;
}

export type ConflictResolution =
  | { action: 'block' }        // give up this cycle; surface blocked
  | { action: 'keepMine' }     // engine: push --force-with-lease
  | { action: 'takeRemote' }   // engine: reset tree + branch to remoteSha
  | { action: 'merged' };      // policy already wrote a resolved tree; engine commits + pushes

export interface ConflictPolicy {
  onConflict(ctx: ConflictContext): Promise<ConflictResolution>;
}
```

- **Default (headless) policy** returns `{ action: 'block' }` immediately —
  used in tests and any non-interactive consumer.
- **Studio's interactive policy** renders the badge's choice and returns a
  promise that the user's click fulfils (`keepMine` / `takeRemote`). The
  engine sits in `blocked` while awaiting; no `resolve()` round-trip needed.
- **Future 3-way-merge policy** writes conflict markers via `ctx.fs`,
  surfaces an editor merge UI, and returns `{ action: 'merged' }` once the
  user resolves — **no engine change required.**

Engine handling of each action: `keepMine` → `git.push` with
force-with-lease against `remoteSha`; `takeRemote` → checkout/reset working
tree + branch to `remoteSha`, discarding local commits; `merged` → stage +
commit the resolved tree, then push; `block` → emit `blocked` and stop until
the next `notifyDirty`/`syncNow`.

### 5.4 Invariant

A local commit (durable in OPFS git) always happens before any network step.
Therefore no network outcome can lose edits; sync failure degrades to
"committed locally, unpushed."

## 6. Studio integration (thin consumer)

1. **`git-backing.ts` becomes an adapter.** It stops owning sync logic;
   instead it constructs `createGitSyncEngine` with:
   - `fs` = the existing `OpfsFs` `{ promises }` adapter,
   - `dir = /<id>/files`, `gitdir = /<id>/.git` (the layout fix, §1 item 2),
   - `corsProxy` = the new Worker route,
   - `onAuth` = `() => ({ username: user, password: workspaceToken })`.
2. **Reconcile clone to the same `dir`/`gitdir`.** `cloneRepository` switches
   to `dir = /<id>/files`, `gitdir = /<id>/.git` (§1 item 2). After this, cloned files
   land where the editor reads them, and edits are visible to git.
3. **Wire save → `notifyDirty()`.** The workspace save path calls the engine
   for git-backed workspaces.
4. **Sync-status badge** (small DS component) subscribes to engine state:
   `idle`/clean (subtle or hidden), `committing|fetching|merging|pushing`
   (spinner), `blocked` (amber + "Resolve" → keepMine/takeRemote choice),
   `offline` (queued). The studio supplies an **interactive `ConflictPolicy`**
   (§5.3) whose `onConflict` returns a promise; the badge's keepMine/takeRemote
   buttons fulfil it. No engine `resolve()` call.
5. **`WorkspaceRecord.gitBacking`** persists `syncState` + `lastSyncedSha`
   (fields already exist).

### 6.1 git-http proxy Worker

Extend `github-auth-worker` (it already owns the GitHub App + origin
allowlist) with a git smart-HTTP forwarder: `/info/refs`,
`/git-upload-pack`, `/git-receive-pack`. It attaches the token server-side,
enforces the origin allowlist, forwards to `github.com`, and **never logs the
token**. `git-backing.ts`'s `CORS_PROXY` constant points here instead of
`cors.isomorphic-git.org`.

## 7. Error handling

| Situation | Detection | Behavior |
|---|---|---|
| Real merge conflict | `merge` aborts | engine awaits `policy.onConflict`; emits `blocked` + `conflictPaths`; local commit intact; policy returns keepMine / takeRemote / merged |
| Non-fast-forward push | push rejected | one auto fetch+merge retry; then `blocked` |
| Offline / network error | fetch/push throws | `offline`; local commit kept; retry on `onLine` or next save |
| No write access | push 403 | terminal `blocked`, distinct copy ("no push access"); fork-PR is future work |
| Token expired/revoked | proxy 401 | re-auth via existing device-flow dialog; rewrites per-workspace token in place |
| Concurrent tabs | existing ownership claim | only the owning tab's engine runs; non-owners read-only |

## 8. Testing

- **`git-sync-engine` (unit):** drive the state machine with a mocked
  isomorphic-git: debounce coalescing (N rapid `notifyDirty` → one commit),
  ff happy path, clean auto-merge, non-ff retry-once, offline → retry, and a
  stub `ConflictPolicy` returning each action — `block` → `blocked`,
  `keepMine` → force-with-lease, `takeRemote` → reset, `merged` →
  commit+push. Assert the engine awaits the policy and applies its return.
- **`git-backing.ts` (unit, in-memory FS):** reuse `in-memory-fs.ts` + a
  local bare-repo fixture through a fake http. Assert `dir`/`gitdir` split
  lands files at `/<id>/files` and `.git` at `/<id>/.git`; full round-trip
  clone → edit → commit → `detectSyncState` reports `ahead`.
- **proxy Worker (unit):** mirror `device-flow.test.ts` — injects auth,
  forwards the three smart-HTTP endpoints, enforces origin allowlist, never
  logs the token.
- **Integration (1-2):** real `OpfsFs` + local git server for
  clone → edit → sync → verify-remote. Keep minimal; matrix lives in unit.
- **Playwright:** optional single smoke test of badge transitions.
- `detectSyncState` extends from clean/ahead to the full `behind`/`diverged`
  it already types.

## 9. Build sequence (for the plan)

1. `packages/git-sync-engine` skeleton + types + unit-test harness (mock
   iso-git). Engine state machine, no consumer.
2. git-http proxy route in `github-auth-worker` + tests.
3. `git-backing.ts` layout fix (`dir`/`gitdir`) + clone reconciliation +
   round-trip test.
4. Wire engine into the studio: save → `notifyDirty`, status badge,
   `WorkspaceRecord` persistence.
5. Studio interactive `ConflictPolicy` + badge resolve UX (keepMine /
   takeRemote); engine remains untouched.
6. Integration + optional Playwright smoke.

## 10. Open questions / deferred

- Real in-editor 3-way merge UI (pluggable policy) — deferred.
- Fork-and-PR for no-push-access repos — deferred.
- Whether to publish `git-sync-engine` to npm — defer until proven against
  the studio consumer.
