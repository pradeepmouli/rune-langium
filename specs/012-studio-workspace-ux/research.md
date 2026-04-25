# Phase 0 — Research

**Feature**: 012-studio-workspace-ux
**Spec**: [spec.md](./spec.md)
**Date**: 2026-04-24

This document resolves the unknowns called out in the spec's Clarifications and
in the implementation plan's Technical Context. Each section follows the
standard *Decision / Rationale / Alternatives* shape.

---

## R1. `@zod-to-form/*` upgrade — actual versions and Vite-plugin shape

**Source of truth**: local checkout at `/Users/pmouli/GitHub.nosync/active/ts/zod-to-form` (per spec's plan-phase research note).

**Decision**:

- Bump `@zod-to-form/{core,react,cli}` from `^0.4.0` → `^0.7.1`.
- Add `@zod-to-form/vite@^0.2.1` as a new direct dev-dep on `@rune-langium/visual-editor` (and on `@rune-langium/studio`, since Studio's Vite is what actually bundles the visual editor for the deployed app).
- Drop `@zod-to-form/cli` from `dependencies`, since the migration removes the CLI step. Keep it only if a one-shot codegen for tests is still required (decision: not required — vitest's Vite pipeline picks up `?z2f` imports natively).
- Migration path: query-string mode (`import Form from './schema.ts?z2f'`) for new code; for the existing five committed forms (Data, Choice, RosettaEnumeration, RosettaFunction, RosettaTypeAlias), rewrite the call sites to `?z2f` imports in the same commit that deletes `packages/visual-editor/src/components/forms/generated/`.

**Breaking changes between 0.4.0 and 0.7.1 (from the local CHANGELOG)**:

- **0.5.0** — removed deprecated type aliases and functions; CLI codegen simplified (no more "section handling" path). *Action*: scan `MapFormRegistry.ts` and the form components for any deprecated import names; replace.
- **0.6.0** — *unified* `fieldType` and `component` into a single `component` property across core / cli / react. *Action*: search the rune codebase for `fieldType` in `FormMeta` payloads and `z2f.config.ts`; rename to `component`. (See FR-Z01.)
- **0.7.x** — incremental, no documented further breaks; mostly bug fixes and the Vite plugin landing.

**Plan-phase audit (FR-Z06)**:

The current rune-langium consumption has at least two patterns that warrant
audit against the upstream canonical examples:

- `MapFormRegistry.ts` declares a *local* structural interface
  (`ZodFormRegistryLike`) "to avoid a direct dep on `@zod-to-form/core`".
  Newer `@zod-to-form/core` exports `ZodFormRegistry` cleanly; importing the
  real type and dropping the local shim is the correct shape under 0.7.x.
- The five separate `pnpm scaffold:*Form` scripts are a workaround for the
  CLI's per-export invocation. The Vite plugin removes the need to enumerate
  exports — `?z2f&export=DataSchema` (or similar; see plugin docs) does this
  per-import. *Action*: remove the five npm scripts entirely.

Any *deliberate* divergences (none identified yet — to be confirmed during
implementation) are to be recorded alongside the migration commit.

**Rationale for query-string mode over generate mode**:

The spec's FR-Z03 requires HMR on schema edit. The plugin's query-string
mode triggers HMR via Vite's standard module graph; generate mode (which
rewrites `<ZodForm>` JSX call sites) is a heavier transformation that's only
worth it for migrating untyped runtime usage. Since rune-langium's forms are
already statically referenced, the simpler mode wins.

**Alternatives considered**:

- *Stay on 0.4.0 with the CLI flow*: rejected — the spec's FR-Z01 requires
  upgrading. CLI mode also keeps the committed `forms/generated/` directory
  alive, contradicting FR-Z02.
- *Adopt generate mode (JSX rewrite)*: rejected — heavier transformation
  surface, harder to debug, no current call sites that would benefit.
- *Pin to 0.6.x*: rejected — 0.7.x is the upstream stable line and the Vite
  plugin only ships there.

---

## R2. OPFS as primary storage + `isomorphic-git` integration

**Source survey**: Read `node_modules/.pnpm/isomorphic-git@1.37.4/.../README.md`. `isomorphic-git` does **not** ship a built-in OPFS adapter; it accepts any object that conforms to its [filesystem interface](https://isomorphic-git.org/docs/en/fs) (`readFile`, `writeFile`, `mkdir`, `unlink`, `rmdir`, `stat`, `lstat`, `readdir`, `readlink`, `symlink`, `chmod`). The `@isomorphic-git/lightning-fs` package is one such implementation, IndexedDB-backed.

**Decision**:

- Add a new package `@rune-langium/opfs-fs` that implements isomorphic-git's
  documented FS shape on top of `FileSystemDirectoryHandle` /
  `FileSystemFileHandle`. Symlinks and `chmod` are stubbed (return success
  with no-op semantics) — git's pack format does not require real symlink
  support for our usage (no submodules, no symlinked tree entries in the
  CDM/FpML/rune-dsl repos).
- All workspace file content lives under a per-workspace OPFS directory:
  `/<workspace-id>/files/...` for working tree, `/<workspace-id>/.git/...`
  for the git object store when the workspace is git-backed.
- IndexedDB (using `idb`, already in use) holds a small index: workspace
  list, recent-workspaces, panel layouts, settings. Nothing larger than a
  few KB per record.
- Migration from `LightningFS` (FR-017) is **cut-clean**, not transitional:
  on first launch of the new Studio version, detect the legacy IndexedDB
  databases (`fs` / `lightning-fs-cache`); if present and non-empty, walk
  them and copy files to OPFS under a default workspace; then DELETE the
  legacy DBs in the same pass. `@isomorphic-git/lightning-fs` is removed
  from dependencies in the same commit. If the copy fails partway, Studio
  surfaces an explicit "Export legacy data" affordance that gives the user
  a zip bundle, and only then discards. No release ships with both storage
  layers live.

**Rationale**:

- OPFS gives synchronous-or-async file handles with random access, which
  matches git's pack-file IO pattern much better than IndexedDB's
  blob-per-key. `isomorphic-git`'s pack handling does many small reads at
  arbitrary byte offsets; LightningFS pays a serialization cost on every
  one of those.
- Per-origin isolation is the same as IndexedDB, so no privacy regression.
- The workspace-as-directory layout makes "delete a workspace" a single
  `removeEntry` call and "export workspace" a directory walk.

**Alternatives considered**:

- *Stay on LightningFS*: rejected by clarification Q2 (B). Performance gap
  becomes user-visible at corpus scale.
- *Use a community OPFS-isomorphic-git adapter*: surveyed — a few exist
  (e.g., the `@forgejs/opfs-fs` style) but none are widely adopted or
  audited; the FS interface is small enough that a vendored adapter is
  lower risk than another dep.
- *Use Origin Private File System through the FileSystemAccess API as a
  filesystem mount*: tempting but not portable — the chosen path uses the
  OPFS-only subset every modern Chromium/WebKit/Firefox supports.

---

## R3. Curated-model R2 mirror — refresh pipeline

**Decision**:

- New CF Worker `apps/curated-mirror-worker` with a Cron Trigger
  (`0 3 * * *` UTC, ~3 AM nightly).
- For each curated source (CDM, FpML, rune-dsl), the worker:
  1. Fetches `https://codeload.github.com/{owner}/{repo}/tar.gz/refs/heads/{ref}`
     — GitHub's archive endpoint, no auth needed for public repos, single
     compressed file response.
  2. Streams the tar.gz into R2 at `curated/<id>/<yyyy-mm-dd>.tar.gz`.
  3. Updates `curated/<id>/manifest.json` with `{ version: <yyyy-mm-dd>,
     sha256, sizeBytes, generatedAt }`.
  4. Updates `curated/<id>/latest.tar.gz` (R2 alias) by copying or
     re-uploading the date-stamped object.
- Studio's load path is now: `GET /curated/<id>/manifest.json` (cheap;
  satisfies FR-005b) → if newer than cached, surface "Update available"
  affordance → on accept, `GET /curated/<id>/latest.tar.gz` →
  client-side untar (using `pako` + a small tar parser) → write into OPFS.
- The R2 bucket is fronted by a CF Worker route so the public Studio can
  fetch it on the same origin (`www.daikonic.dev/curated/...`). No CORS
  preflight needed.

**Rationale**:

- `codeload.github.com` archive endpoint is stable, fast, and free of the
  CORS proxy / git protocol round-trip the existing flow has.
- Date-stamped + `latest` two-key pattern means we can roll back the
  *mirror* without re-fetching, and clients only need one URL.
- `manifest.json` lets the client do an HTTP HEAD/conditional fetch to check
  freshness without touching the multi-MB archive.

**Alternatives considered**:

- *Use the GitHub REST `repos/.../tarball` endpoint*: rejected — requires
  authenticated calls in some quota states; `codeload.github.com` is the
  CDN endpoint and works unauthenticated.
- *Mirror as a directory of individual files in R2*: rejected — defeats the
  "single fetch" speed goal; operational pain.
- *Use a separate scheduled GitHub Action to upload to R2*: rejected — keeps
  the CF account as the single ops surface; reuses the same Wrangler pattern
  as feature 011.

---

## R4. Dockable IDE-style layout — library choice

**Survey**: react-mosaic (Palantir), flexlayout-react, dockview, allotment, react-resizable-panels.

**Decision**: **`dockview`** (specifically `dockview-react`).

Why dockview:

- Native concept of *dockable groups* (drag tabs between groups, split groups
  into rows/columns, collapse panels) matches FR-020–FR-024 directly.
- First-class JSON serialization API (`api.toJSON()` / `api.fromJSON()`)
  matches FR-021/FR-025 (versioned panel layouts that degrade gracefully).
- TypeScript-first; React bindings are official.
- Supports keyboard navigation between panels, which is the foundation of
  FR-A02 (keyboard equivalents). Where it falls short of WCAG 2.1 AA, we
  layer our own focus management — but dockview is closer to AA out of the
  box than any of the alternatives surveyed.
- Active maintenance, MIT.

**Layout inventory (binding the panel set in FR-021)**:

| Slot | Default panel | Collapsible | Notes |
|---|---|---|---|
| Activity bar (left edge) | Workspace switcher, model registry, settings | partly | Always visible; not a dockview group itself. |
| Primary side panel (left) | File tree | Yes | Hosted in a dockview group. |
| Secondary side panel (right) | Inspector (form for selected node) | Yes | Hosted in a dockview group. Hosts the migrated z2f forms (US5). |
| Editor area (centre) | Tabbed Monaco editor | No (always present) | Drag-reorder tabs, drag-out to side as a new group. |
| Panel area (bottom) | Problems / Output / Visual Editor preview | Yes | Hosted in a dockview group. |
| Status bar (bottom edge) | Workspace name, git status, language server status | n/a | Always visible. |

**Default-on-small-viewport (≤1280px)** (FR-024): primary + secondary side
panels start collapsed; bottom panel starts collapsed. Editor is the visible
default.

**Alternatives considered**:

- *flexlayout-react*: equally capable, similar API. Marginal preference for
  dockview because its default visual treatment is closer to the IDE-look
  the spec asks for; flexlayout's defaults need more theming.
- *allotment + custom tab bar*: rejected — too much DIY work for the dock
  semantics (drag panel between groups, which dockview does for free).
- *react-mosaic*: rejected — has no first-class tab concept; would need
  to layer one.
- *react-resizable-panels*: rejected — pure splitter, no docking, no tabs.

---

## R5. Cross-app design tokens / design-system package

**Decision**:

- New package `@rune-langium/design-tokens` containing JSON tokens (colour,
  typography, spacing, radii, shadows, motion) plus generated CSS custom
  properties (built via [Style Dictionary](https://amzn.github.io/style-dictionary/)
  or equivalent — a small build script is sufficient, no need to introduce
  Style Dictionary if a 50-line generator suffices).
- Existing `@rune-langium/design-system` package gains a hard dep on
  `@rune-langium/design-tokens` and is the React primitive layer
  (Button, Link, Input, Heading, etc.) shared across all three surfaces.
- The landing site (`apps/site`), the docs (`apps/docs`, VitePress) and
  Studio all consume `@rune-langium/design-system` for primitives and
  `@rune-langium/design-tokens`'s CSS variables for raw values. VitePress
  is wired via a custom theme that imports the tokens stylesheet.
- Tailwind config in Studio is updated to read its colour / spacing scale
  from the same tokens file so utility classes stay consistent with the
  primitives.

**Rationale**:

- A design *tokens* package (data) plus a design-*system* package
  (components) is the standard split — it lets Tailwind, VitePress, and
  React components all read from one source without coupling them through
  React.
- Tokens are CSS variables in the runtime so dark/light theme switching
  is a single `data-theme` attribute swap.
- Using primitives (FR-033) means a future colour change is one PR, not three.

**Alternatives considered**:

- *Put everything in `@rune-langium/design-system`*: rejected — VitePress
  has a hard time importing React. Tokens-as-CSS-variables side-steps that.
- *Run-time theme picker in JS*: rejected — CSS variables + `prefers-color-scheme`
  cover the case without JS.
- *Per-app duplicated tokens "kept in sync manually"*: rejected — that's the
  status quo and the source of FR-030's drift.

---

## R6. GitHub-as-workspace-backing — auth and operations

**Decision**:

- Auth via **GitHub OAuth Device Flow** through a new tiny CF Worker
  (`apps/github-auth-worker`):
  1. User clicks "Connect GitHub" in Studio.
  2. Studio POSTs to the worker's `/oauth/device-init`. Worker calls
     GitHub's `/login/device/code` with a project-owned GitHub App
     client ID, returns the user code + verification URL.
  3. Studio shows the user code; user opens GitHub, authorises.
  4. Studio polls the worker's `/oauth/device-poll` until GitHub returns
     a token. Worker forwards it to the client over HTTPS.
  5. Token is stored in OPFS (in the workspace's metadata, NOT in
     IndexedDB or `localStorage`). On revoke, deleting the workspace
     deletes the token.
- Git operations (clone, fetch, pull, commit, push, branch, status) use
  `isomorphic-git` against OPFS. Push uses HTTPS with the device-flow token
  in the `Authorization` header via `isomorphic-git`'s `onAuth` callback.
- Push routes go through the existing `cors.isomorphic-git.org` proxy in
  v1; we do not own that proxy. A follow-up may stand up our own CF Worker
  proxy if it becomes a bottleneck. (Out of scope for this feature.)

**Rationale**:

- Device flow has no in-browser secret to leak (no client secret needed).
- Token lives on the user's device, scoped to the workspace, and the user
  controls revocation both from Studio and from GitHub's app settings.
- We do not maintain a per-user account; we hold a token transiently for
  the duration of operations the user kicks off.

**Out of scope for v1**:

- Multi-account (logging in as more than one GitHub user in Studio).
- Branch protection / required reviews (we surface whatever GitHub returns).
- Private orgs that disallow OAuth Apps without admin approval — the user
  is expected to handle that with their org admin.

**Alternatives considered**:

- *Fine-grained PAT pasted into Studio*: rejected as default — terrible UX
  and the wrong default for a "real product" feel. Kept as a *fallback*
  for users who can't use device flow (e.g. a corporate browser blocking
  the auth popup).
- *GitHub App (server-mediated tokens)*: rejected — adds infra and a
  per-user token-storage server that contradicts the no-accounts stance.
- *GitLab/Bitbucket/anywhere*: out of scope; v1 is GitHub-only.

---

## R7. Telemetry Worker — schema and storage

**Decision**:

- New CF Worker `apps/telemetry-worker` exposing one `POST /v1/event`
  endpoint. Origin: `www.daikonic.dev/rune-studio/api/telemetry`.
- Body schema (Zod-validated server-side; reject 400 on any extra field):
  ```ts
  z.object({
    event: z.enum([
      'curated_load_attempt', 'curated_load_success', 'curated_load_failure',
      'workspace_open_success', 'workspace_open_failure',
      'workspace_restore_success', 'workspace_restore_failure'
    ]),
    error_category: z.string().max(64).optional(),  // FR-002 codes only
    studio_version: z.string().max(32),
    ua_class: z.string().max(64),                   // "Chromium 130" granularity
    occurred_at: z.string().datetime()              // server-stamped on receive
  })
  ```
- Aggregation: a single Durable Object (`TelemetryAggregator`) keyed
  by event name + day, holding rolling counters. Read endpoints
  (`GET /v1/stats`) are admin-only (CF Access) — not exposed to end-users.
- The worker's own logs use the same pino redact rules as
  `apps/codegen-worker`: drop `cf-connecting-ip`, hash IPs into a daily
  rotating salt, never log raw request body.
- A separate DO instance per day-of-event keeps one DO from holding
  unbounded counters.

**Rationale**:

- A single-table aggregate makes "what's our failure rate?" answerable in
  one DO read, no SQL.
- Server-side schema validation means a malicious or buggy client can't
  pollute counters with bogus event names.
- DO-per-day keeps counters bounded and aligns with the daily-rotating IP
  salt — both rotate at the same UTC boundary.

**Alternatives considered**:

- *D1 / Hyperdrive*: rejected for v1 — a counters use case doesn't need a
  relational store.
- *Plain KV*: rejected — eventual consistency gives wrong totals.
- *Third-party RUM (Sentry, PostHog)*: rejected by clarification Q5 (C).

---

## R8. Workspace persistence model — schema and lifecycle

**Decision**:

Workspace metadata lives in IndexedDB; file content lives in OPFS.

```
IndexedDB:
  workspaces (objectStore, keyPath: "id")
    { id, name, createdAt, lastOpenedAt, kind, layoutJson, openTabs[], activeTabPath, gitBacking? }
  recents (objectStore, keyPath: "id", indexed by lastOpenedAt desc)

OPFS:
  /<workspace-id>/files/...           -- working tree
  /<workspace-id>/.git/...             -- (if git-backed) git store
  /<workspace-id>/.studio/scratch.json -- per-tab scroll/cursor positions
  /<workspace-id>/.studio/token        -- (if git-backed) device-flow token
```

Lifecycle:

- *Create*: insert IndexedDB row, create OPFS dir.
- *Open*: bump `lastOpenedAt`, hydrate tabs.
- *Close*: flush dirty buffers to OPFS, persist tabs+layout to IndexedDB.
  Workspace remains in `recents`.
- *Delete*: drop IndexedDB row, recursive `removeEntry` on OPFS dir.
- *Crash recovery* (FR-015): on open, scan for files whose OPFS
  `.studio/dirty.<path>` shadow exists but whose live `files/<path>`
  hasn't been updated since — restore the dirty buffer.

**Rationale**:

- Two stores, each used for what it's good at.
- Lifecycle ops are O(1) directory operations, not multi-row queries.

---

## R9. Multi-tab same-workspace policy

The spec's Assumptions already commit to "first writer wins, others
read-only with a warning" for v1. Concretely:

- A `BroadcastChannel('rune-studio')` advertises which tab owns which
  workspace ID. The first tab to open a workspace claims it; later tabs
  see the ownership message and switch to read-only mode for that
  workspace, with a banner explaining how to take over.
- "Take over" is an explicit user action; switching ownership flushes any
  dirty buffers in the original tab to OPFS first.
- If the owning tab disappears without releasing (browser crash), the
  next request for the workspace claims ownership after a short timeout.

No server is involved. Cross-tab coordination is purely browser-local.

---

## R10. Open question deferred to /tasks: panel `componentName` registry

Each dockview panel is registered by a string `componentName`. We need to
pick the canonical names so saved layouts (FR-025) survive renames. Defer
to /tasks: it's tactical, not architectural. Names will be:
`workspace.fileTree`, `workspace.editor`, `workspace.inspector`,
`workspace.problems`, `workspace.output`, `workspace.visualPreview`.
Anything else will be added with a registered name from day one.

---

## Summary table

| # | Area | Decision | Spec hooks |
|---|---|---|---|
| R1 | z2f upgrade + Vite plugin | 0.4.0 → 0.7.1 + `@zod-to-form/vite@0.2.1` query-string mode | FR-Z01–Z06, US5 |
| R2 | Browser storage | OPFS for files + a vendored isomorphic-git OPFS adapter; IndexedDB for metadata | FR-016–018, US2 |
| R3 | Curated mirror | CF Cron Worker → R2 (date-stamped + latest); manifest.json for cheap freshness | FR-001–008, US1 |
| R4 | Dockable layout | `dockview-react`; six named slots; small-viewport defaults | FR-020–026, US3 |
| R5 | Design system | `@rune-langium/design-tokens` + existing `design-system` package shared across landing/docs/Studio | FR-030–033, US4 |
| R6 | GitHub backing | OAuth Device Flow via a tiny CF Worker; token in OPFS, scoped to workspace | FR-008, US2 |
| R7 | Telemetry | New CF Worker, fixed-schema events, DO-per-day counters, no PII | FR-T01–T05, SC-009 |
| R8 | Workspace persistence | IndexedDB (metadata) + OPFS (files); explicit lifecycle ops | FR-010–015 |
| R9 | Multi-tab policy | BroadcastChannel ownership; read-only fallback | Edge Cases |
| R10 | Panel name registry | Deferred to /tasks | FR-025 |

No `NEEDS CLARIFICATION` remain.
