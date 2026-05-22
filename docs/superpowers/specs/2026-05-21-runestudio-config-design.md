# `.runestudio/` repo-persisted project config — design

Status: **DRAFT for discussion** · 2026-05-21 · Task #299

## 1. Problem

Studio workspace state lives entirely per-machine in IndexedDB
(`WorkspaceRecord`) — including settings that are really *project*
properties: which curated reference models the project depends on, how it
should sync, and how it should generate code. When a teammate clones the
same git-backed repo (or the same user opens it on another machine), none
of that travels; they start from defaults and must re-configure.

This adds a committed, version-controlled **project config file** —
`.runestudio/config.json` inside the repo working tree — that round-trips
via the now-merged git-sync engine (PR #230), à la `.vscode/settings.json`.

### 1.1 Scope (decided in brainstorming)

**Intent:** *shared project config* — settings that define how the project
should be worked with, shared with everyone who clones. NOT personal or
ephemeral UI state.

**In the file (4 fields, all low-churn):**
- **curatedModels** — the project's curated reference-model dependencies
  (`modelId` + `version`).
- **sync** — git-sync policy (auto-sync on/off, debounce, branch).
- **project** — human metadata (display name, description).
- **codegen** — the project's codegen config (target, layout, namespaces,
  per-target options) so the team generates identically.

**Explicitly NOT in the file (stay per-machine in IndexedDB):** dockview
`layout`, open `tabs`, `activeTabPath`, `structureView` expansion — personal
and/or high-churn.

**Hard constraint:** the GitHub token NEVER goes in this file. It stays at
OPFS `/<id>/.studio/token`, outside the working tree. The schema has no
secret field by construction.

**Applies to git-backed workspaces only.** Browser-only / folder-backed
workspaces have no remote to round-trip to and are unaffected (those 4
fields stay IDB-only, exactly as today).

## 2. Goals / Non-goals

**Goals**
- A single committed `config.json` that travels with the repo and seeds a
  fresh clone / another machine.
- File is the source of truth for the 4 shared fields on git-backed
  workspaces; IDB caches them for fast reads + offline.
- Reuse the existing git-sync engine for commit/push/pull/conflict — no new
  sync machinery.
- No measurable commit noise (scope is stable, low-churn settings; writes
  happen only on explicit settings changes).

**Non-goals**
- Personal UI-state sync (layout/tabs/expansion) — deliberately excluded.
- A merge UI for config conflicts — reuse the engine's block →
  keep-mine / take-remote.
- Config for non-git workspaces.
- A "recommended default layout" shipped by the project (considered, cut).

## 3. Decisions (from brainstorming)

| Axis | Decision |
|---|---|
| Intent | Shared project config (like `.vscode/settings.json`) |
| Contents | curatedModels, sync, project metadata, codegen options |
| Source of truth | **File authoritative + IDB cache** (git-backed) |
| File layout | Single versioned `config.json` (not split) |
| Schema | Zod, `version` field, unknown fields preserved |
| Conflicts | Existing engine flow (block → keep-mine / take-remote) |
| Token | Never in the file; stays in OPFS `.studio/` |

## 4. File: `/<id>/files/.runestudio/config.json`

Lives inside the git working tree (`/<id>/files`), so the sync engine
stages/commits/pushes it like any file. Validated with Zod.

```ts
// apps/studio/src/workspace/runestudio-config.ts
// (studio-specific — depends on WorkspaceRecord + OPFS; not a shared package)
export const RuneStudioConfigSchema = z.object({
  version: z.literal(1),
  project: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
  curatedModels: z.array(z.object({
    modelId: z.string(),
    version: z.string(),
  })).optional(),
  sync: z.object({
    autoSync: z.boolean().optional(),
    debounceMs: z.number().int().positive().optional(),
    branch: z.string().optional(),
  }).optional(),
  codegen: z.object({
    target: z.string(),
    layout: z.string().optional(),
    namespaces: z.array(z.string()).optional(),
    options: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
}).passthrough(); // preserve unknown top-level keys (forward-compat)

export type RuneStudioConfig = z.infer<typeof RuneStudioConfigSchema>;
```

Notes:
- `.passthrough()` (or an equivalent merge-on-write) preserves keys written
  by a newer studio version so we never clobber settings we don't
  understand.
- `codegen` reuses the existing codegen-options/`DownloadConfig` shape where
  practical (align field names with `apps/studio/src/components/
  DownloadConfigModal.tsx` + `packages/codegen` options at implementation
  time rather than inventing a parallel shape).
- `curatedModels` stores only the **declarative** part (`modelId` +
  `version`); per-machine runtime fields (`loadedAt`, `updateAvailable`)
  stay in `WorkspaceRecord.curatedModels` in IDB.

## 5. Architecture & data flow

```
                    /<id>/files/.runestudio/config.json   (committed, in working tree)
                              ▲                │
              writeRuneStudioConfig      readRuneStudioConfig
                              │                ▼
   settings UIs ── updateProjectConfig ──> OPFS write + IDB cache update + notifySyncOnSave
                                                        │
                                                  GitSyncEngine (debounce → commit → push)
   open / post-pull ──> hydrate: read file ──> WorkspaceRecord (IDB) + in-memory state
```

**Source of truth = the file** (git-backed). The IDB copy of the 4 fields is
a cache that keeps existing read sites fast/unchanged and works offline.

- **On open** of a git-backed workspace → `readRuneStudioConfig`; if present,
  hydrate the 4 fields into the `WorkspaceRecord` (IDB) + memory (file wins).
  Absent → keep IDB/defaults.
- **After a sync that pulled remote changes** (engine reaches `idle` with a
  changed `lastSyncedSha`) → re-hydrate from the (now-updated) file.
- **On a settings change** → `updateProjectConfig(id, patch)`: write
  `config.json`, update the IDB cache, `notifySyncOnSave(id)` → engine
  debounces, commits, pushes.
- **On conflict** (two devs edit `config.json`) → engine block →
  keep-mine / take-remote; take-remote then re-hydrates.
- Per-machine fields (layout, tabs, activeTabPath, structureView) never
  touch the file.

Because the git-backed save path already **preserves the untracked tree**
(the data-loss fix in #230), `config.json` survives editor saves with no
special-casing.

## 6. Components

1. **`runestudio-config.ts`** (one responsibility: the file's schema + I/O):
   - `RuneStudioConfigSchema` + `RuneStudioConfig` type.
   - `readRuneStudioConfig(fs, workspaceId): Promise<RuneStudioConfig | null>`
     — reads `/<id>/files/.runestudio/config.json`, Zod-parses; returns
     `null` on absent or invalid (logs on invalid, never throws).
   - `writeRuneStudioConfig(fs, workspaceId, cfg): Promise<void>` — merges
     over any existing file (preserving unknown keys), writes pretty JSON.
   - Pure I/O over the fs interface → unit-testable with `InMemoryFs`.
2. **`updateProjectConfig(workspaceId, patch)`** — thin orchestration used by
   settings UIs: `writeRuneStudioConfig` → update IDB cache (`saveWorkspace`)
   → `notifySyncOnSave(workspaceId)`.
3. **Hydration integration** at: (a) git-backed workspace open
   (`WorkspaceManager.open` / App restore path); (b) post-pull re-hydrate
   (hook off the engine reaching `idle` with a new `lastSyncedSha`).
4. **Write-site integration** — curated load/unload, sync-prefs UI, codegen
   options (DownloadConfigModal), project metadata → call
   `updateProjectConfig`.

## 7. Edge cases

| Situation | Behavior |
|---|---|
| File absent | Use IDB/defaults; first write creates it |
| Malformed / Zod-invalid | Log + fall back to IDB/defaults; **don't crash, don't overwrite** (could be a newer-version file); non-fatal notice |
| `version` newer than known | Read known fields; preserve unknown keys on rewrite |
| Config conflict on pull | Engine block → keep-mine / take-remote; take-remote re-hydrates |
| Non-git workspace | No-op — file never written; fields stay IDB-only |
| Token leakage | Schema has no secret field; a test asserts written output never contains the token |
| Commit noise | Writes only on explicit settings changes (rare); engine debounce covers bursts; no extra throttle |

## 8. Testing

- **Unit (`InMemoryFs`):** read/write round-trip; absent → `null`; malformed
  → `null` + no throw; unknown-field preservation on rewrite; Zod rejects
  bad shapes; **token-safety** — written output never contains a token-shaped
  secret.
- **Hydration:** open a git-backed workspace whose tree has a `config.json`
  → the 4 fields populate the `WorkspaceRecord`.
- **Write:** `updateProjectConfig` writes the file + updates IDB + calls
  `notifySyncOnSave`.
- **Integration:** clone-with-config → open → fields hydrated; change a
  setting → file written (engine commit covered by #230's tests).

## 9. Build sequence (for the plan)

1. `runestudio-config.ts` — schema + read/write + unit tests (InMemoryFs).
2. `updateProjectConfig` helper + test (writes file + IDB + notify).
3. Hydrate-on-open wiring + test.
4. Post-pull re-hydrate hook.
5. Write-site integration (curated, sync prefs, codegen options, metadata),
   verified at each mount site.

## 10. Open questions / deferred

- Exact alignment of the `codegen` block with the existing codegen-options
  types is settled at implementation time (reuse, don't re-invent).
- Personal UI-state sync (layout/tabs) — out of scope, may never be wanted.
- A settings UI surface for `project` metadata may be a small follow-up if
  one doesn't already exist.
