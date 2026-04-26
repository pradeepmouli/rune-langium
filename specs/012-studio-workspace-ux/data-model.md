# Phase 1 — Data Model

**Feature**: 012-studio-workspace-ux
**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

This document fixes the on-disk shapes that survive across sessions. Anything
**not** listed here is in-memory only and may change between Studio versions
without migration.

---

## 1. IndexedDB schema (`rune-studio` database)

Database name: `rune-studio`
Version: `1` (this is the first OPFS-aware schema; legacy `lightning-fs` /
`fs` databases are migrated then deleted — see FR-017).

### 1.1 `workspaces` object store

Key path: `id` (string, ULID).

```ts
interface WorkspaceRecord {
  /** ULID. Stable for the life of the workspace. Used as the OPFS dir name. */
  id: string;
  /** User-supplied display name. May be renamed; not unique. */
  name: string;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. Updated on every open. Drives recent-workspaces order. */
  lastOpenedAt: string;
  /** Discriminator for kind-specific fields. */
  kind: 'browser-only' | 'folder-backed' | 'git-backed';
  /** dockview JSON layout (R4). Schema-versioned for FR-025. */
  layout: PanelLayoutRecord;
  /** Editor-tab state. */
  tabs: TabRecord[];
  /** Path of the currently active tab, or null if none. */
  activeTabPath: string | null;
  /** Curated models loaded into this workspace. */
  curatedModels: CuratedModelBinding[];
  /** Present iff kind === 'folder-backed'. */
  folderHandle?: FileSystemDirectoryHandleId;  // see §1.4
  /** Present iff kind === 'git-backed'. */
  gitBacking?: GitBackingRecord;
  /** Schema migration version of THIS record's shape. */
  schemaVersion: number;
}

interface TabRecord {
  /** OPFS-relative path or curated-model URI. */
  path: string;
  /** Tab order — 0-based. */
  order: number;
  /** Whether this tab has a dirty buffer in OPFS. */
  dirty: boolean;
}

interface CuratedModelBinding {
  /** ID from the curated registry: 'cdm', 'fpml', 'rune-dsl'. */
  modelId: string;
  /** Mirror version we loaded. From manifest.json (R3). */
  loadedVersion: string;
  /** ISO-8601 UTC of the load. */
  loadedAt: string;
  /** Whether a newer mirror is currently advertised (FR-005a). */
  updateAvailable: boolean;
}

interface GitBackingRecord {
  /** Repo URL — https://github.com/owner/repo */
  repoUrl: string;
  /** Branch name. */
  branch: string;
  /** GitHub login of the connected account, for display only. */
  user: string;
  /** Reference to the device-flow token in OPFS. We store the *path*, not the secret. */
  tokenPath: string;
  /** Last sync state. */
  syncState: 'clean' | 'ahead' | 'behind' | 'diverged' | 'conflict';
  /** Last commit SHA Studio observed (after the most recent push or pull). */
  lastSyncedSha: string | null;
}
```

### 1.2 `recents` object store

Key path: `id`. Indexed by `lastOpenedAt` (descending) for the
recent-workspaces list. Effectively a denormalised view of `workspaces`
limited to the columns needed to render the list, so closing the workspace
list is one cursor scan.

```ts
interface RecentWorkspaceRecord {
  id: string;
  name: string;
  kind: WorkspaceRecord['kind'];
  lastOpenedAt: string;
}
```

### 1.3 `settings` object store

Key path: `key`. Holds Studio-wide settings, currently:

```ts
type SettingRecord =
  | { key: 'theme'; value: 'system' | 'light' | 'dark' }
  | { key: 'telemetry-enabled'; value: boolean }     // FR-T03
  | { key: 'reduced-motion'; value: boolean }
  | { key: 'editor.tab-size'; value: 2 | 4 }
  | { key: 'design-system-version'; value: string };
```

### 1.4 `handles` object store

Key path: `id` (string). Holds serialised
`FileSystemDirectoryHandle`s for folder-backed workspaces (the only file
system handle the browser lets us persist). The `WorkspaceRecord.folderHandle`
field is the key into this store.

```ts
interface FolderHandleRecord {
  id: string;
  handle: FileSystemDirectoryHandle;  // structured-clone storable
  /** Permission state at last access. */
  lastPermission: 'granted' | 'prompt' | 'denied';
}
```

### 1.5 `panel-layouts` is **not** a separate store

Layouts live inside `WorkspaceRecord.layout`. Cross-workspace layout sharing
is out of scope for v1.

---

## 2. OPFS layout

Per-workspace tree under the origin's OPFS root:

```
/
└── <workspace-id>/
    ├── files/                              # working tree
    │   └── ...                             # arbitrary nested files
    ├── .git/                                # only iff git-backed (R6)
    │   └── ...                             # standard git object/index/refs layout
    ├── .studio/
    │   ├── scratch.json                     # per-tab scroll/cursor state
    │   ├── dirty/                           # crash-recovery buffers (FR-015)
    │   │   └── <encoded-path>.txt           # one per dirty file
    │   └── token                            # iff git-backed: device-flow token, mode=600 logically
    └── README.md (optional, user content)
```

### Path rules

- Workspace IDs are ULIDs, so they're URL-safe and sortable.
- `<encoded-path>` is the `files/`-relative path with `/` → `__` and any
  unsafe chars URL-encoded — no nested OPFS dirs in `dirty/` so we can
  list-and-restore in one pass.
- `.studio/token` is treated as secret: no logging, no telemetry, never
  copied to IndexedDB. Permission to read is implicit since OPFS is per-origin.

---

## 3. R2 layout (curated mirror)

Bucket name: `rune-curated-mirror`.

```
/
└── curated/
    ├── cdm/
    │   ├── manifest.json
    │   ├── latest.tar.gz
    │   └── archives/
    │       ├── 2026-04-24.tar.gz
    │       ├── 2026-04-23.tar.gz
    │       └── ...
    ├── fpml/
    │   ├── manifest.json
    │   ├── latest.tar.gz
    │   └── archives/...
    └── rune-dsl/
        └── ...
```

`manifest.json` contract (versioned via `schemaVersion`):

```ts
interface CuratedManifest {
  schemaVersion: 1;
  modelId: 'cdm' | 'fpml' | 'rune-dsl';
  /** Date stamp of the archive (UTC, yyyy-mm-dd). Monotonic per modelId. */
  version: string;
  /** SHA-256 of the latest.tar.gz, hex. */
  sha256: string;
  /** Compressed size in bytes. */
  sizeBytes: number;
  /** ISO-8601 UTC. */
  generatedAt: string;
  /** Upstream commit SHA the archive was built from. */
  upstreamCommit: string;
  /** Upstream branch. */
  upstreamRef: string;
  /** Public URL that returns the bytes. */
  archiveUrl: string;
  /** N most recent archive URLs (oldest first), for rollback. */
  history: Array<{ version: string; archiveUrl: string }>;
}
```

Archive retention policy: keep the latest 14 date-stamped archives. Older
objects are pruned by the same Cron Worker. Manifest's `history` is capped
at 14 entries.

---

## 4. Telemetry payload (wire format)

See [contracts/telemetry-event.md](./contracts/telemetry-event.md). The Zod
schema is the source of truth; this section duplicates only what's needed
for cross-reference.

```ts
type TelemetryEvent =
  | { event: 'curated_load_attempt'; modelId: 'cdm' | 'fpml' | 'rune-dsl' }
  | { event: 'curated_load_success'; modelId: 'cdm' | 'fpml' | 'rune-dsl'; durationMs: number }
  | { event: 'curated_load_failure'; modelId: 'cdm' | 'fpml' | 'rune-dsl'; errorCategory: ErrorCategory }
  | { event: 'workspace_open_success' | 'workspace_open_failure' }
  | { event: 'workspace_restore_success' | 'workspace_restore_failure' };

type ErrorCategory =
  | 'network' | 'archive_not_found' | 'archive_decode' | 'parse'
  | 'storage_quota' | 'permission_denied' | 'unknown';
```

Common envelope (added by every event): `studio_version`, `ua_class`,
`occurred_at`. NO `userId`, NO IP, NO file paths, NO repo URLs (FR-T02).

---

## 5. Design tokens (canonical shape)

Tokens live in `packages/design-tokens/src/tokens.json` and emit two outputs:

- `dist/tokens.css` — a `:root { --foo: ... }` stylesheet.
- `dist/tokens.ts` — typed `as const` object for React consumers that need
  raw values (rare; primitives should use the CSS variables).

Token namespaces (locked):

```
color.surface.{1,2,3}                    # background tiers
color.foreground.{primary,secondary,muted}
color.accent.{base,hover,subtle}
color.danger.{base,hover}
color.warning.{base,hover}
color.success.{base,hover}
color.border.{subtle,default,strong}
font.family.{sans,mono}
font.size.{xs,sm,base,lg,xl,2xl,3xl}
font.weight.{regular,medium,semibold,bold}
line-height.{tight,normal,relaxed}
spacing.{0,1,2,3,4,6,8,12,16,24,32}      # 4px scale
radius.{sm,md,lg,full}
shadow.{sm,md,lg}
motion.duration.{fast,base,slow}
motion.easing.{standard,emphasis}
z-index.{base,popover,modal,toast}
```

Light/dark are two themes that override `color.*` only; type/spacing/radius
do not change. Tokens are stable: a token may be added across versions, but
the listed names above MUST NOT be renamed without a major version bump of
`@rune-langium/design-tokens`.

---

## 6. Migration: `lightning-fs` → OPFS

One-shot, executed lazily on first open of a Studio version that ships this
feature.

| Source (legacy IndexedDB) | Target (OPFS) | Notes |
|---|---|---|
| `fs` database, every key | `/<default-ws-id>/files/<path>` | Default workspace id = ULID generated at migration time. |
| `lightning-fs-cache/cdm/...` | `/<default-ws-id>/files/...` | If the user had a curated model already loaded, move it into the default workspace and add a `CuratedModelBinding`. |
| Any unparseable / corrupted key | leave in source DB; surface "Export legacy data" UI | FR-017 fallback. |

Post-migration: drop the source IndexedDB databases in the same atomic
pass (cut-clean per FR-017). `@isomorphic-git/lightning-fs` is removed
from `apps/studio/package.json` in the same commit. Set
`settings.design-system-version` to the current version so subsequent boots
skip the migration check. If migration fails partway, Studio offers
"Export legacy data" (a zip bundle of the raw IndexedDB contents) and
then discards; there is no co-existing-layers fallback.

---

## 7. Versioning rules (cross-cutting)

- `WorkspaceRecord.schemaVersion` starts at `1` for this release. Future
  changes bump it; an out-of-date record is upgraded on read. Never deleted.
- `WorkspaceRecord.layout.version` starts at `1`. Layout-only schema changes
  bump this without touching the workspace version (the panel set in R4 is
  the v1 baseline).
- `CuratedManifest.schemaVersion` starts at `1`. Bump only on breaking
  changes; clients reject manifests with a higher major than they understand.
- Everything else is in-memory and versionless.
