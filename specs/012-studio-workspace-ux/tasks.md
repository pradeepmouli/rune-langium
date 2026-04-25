# Tasks: Studio Workspace + IDE-Style UX Polish

**Feature**: 012-studio-workspace-ux
**Branch**: `012-studio-workspace-ux`
**Input**: spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md

Format: `- [ ] Txxx [P?] [USx?] Description with file path(s)`
`[P]` = parallelisable (different files, no pending dependency).
`[USn]` = belongs to User Story *n* (only on user-story phase tasks).

Constitution tie-in: Feature workflow mandates TDD. Every implementation
task in a user-story phase is preceded by the test(s) that describe its
behaviour (contract-test or unit-test), per Phase III. Principle II
(Deterministic Fixtures) applies: the curated-mirror client tests MUST use
vendored `*.tar.gz` fixtures, not the live R2 endpoint.

---

## Phase 1 — Setup

Shared scaffolding. Complete this phase before starting any user story.

- [X] T001 Create `apps/curated-mirror-worker/` skeleton with `package.json`, `wrangler.toml` (Cron `0 3 * * *` UTC + R2 binding `MIRROR_BUCKET`), `tsconfig.json`, and an empty `src/index.ts` exporting `{ scheduled }`
- [X] T002 [P] Create `apps/github-auth-worker/` skeleton with `package.json`, `wrangler.toml` (route `www.daikonic.dev/rune-studio/api/github-auth/*`), `tsconfig.json`, and an empty `src/index.ts` exporting `{ fetch }`
- [X] T003 [P] Create `apps/telemetry-worker/` skeleton with `package.json`, `wrangler.toml` (route `www.daikonic.dev/rune-studio/api/telemetry/*` + DO binding `TELEMETRY` + DO migration v1 `new_classes=["TelemetryAggregator"]`), `tsconfig.json`, and an empty `src/index.ts`
- [X] T004 [P] Create `packages/design-tokens/` with `src/tokens.json` (empty token tree), `src/build.ts` (emits `dist/tokens.css` and `dist/tokens.ts`), `package.json`, and a `build` script wired via `tsgo`
- [X] T005 [P] Provision the CF R2 bucket `rune-curated-mirror` via `wrangler r2 bucket create`; record the ID in `apps/curated-mirror-worker/wrangler.toml`
- [X] T006 Add new workspace members to `pnpm-workspace.yaml` covering the four paths added in T001–T004 (N/A if glob already matches)
- [X] T007 [P] Upgrade `@zod-to-form/{core,react,cli}` in root `package.json` + `packages/visual-editor/package.json` from `^0.4.0` to `^0.7.1`, add `@zod-to-form/vite@^0.2.1` as a dev dep on `packages/visual-editor` and `apps/studio`. Run `pnpm install` and ensure lockfile commits cleanly
- [X] T008 Add the R2 route handler in `apps/codegen-worker` (or a new thin worker bound to the `rune-codegen-worker` pattern — same-origin `/curated/*`) so Studio can fetch the mirror from `www.daikonic.dev/curated/...` without CORS preflight. Matches the existing `/rune-studio/api/generate/*` routing pattern.
- [X] T009 [P] Add runtime dependencies to `apps/studio`: `pako` (gzip), `dockview-react` (IDE layout), `idb` if not already present (verify). Do NOT yet remove `@isomorphic-git/lightning-fs` — removal happens in T105 with the migration code.

**Checkpoint**: `pnpm install` clean; `pnpm -r type-check` clean (new packages may be empty stubs).

---

## Phase 2 — Foundational

Cross-cutting primitives that user stories all depend on. Complete before
Phase 3 (US1).

### 2a. OPFS adapter + workspace primitives

- [X] T010 Write failing test `apps/studio/tests/opfs/opfs-fs.test.ts` asserting the `isomorphic-git`-shaped FS contract: `readFile`, `writeFile`, `mkdir -p`, `unlink`, `rmdir`, `stat`, `lstat`, `readdir`, `readlink` (throws ENOENT), `symlink` (no-op), `chmod` (no-op)
- [X] T011 Implement `apps/studio/src/opfs/opfs-fs.ts` passing T010 — adapter over `FileSystemDirectoryHandle` rooted at a constructor-supplied path prefix
- [X] T012 [P] Write failing test `apps/studio/tests/opfs/tar-untar.test.ts` against a vendored fixture `apps/studio/tests/fixtures/curated/tiny.tar.gz` (3 files, 2 directories); assert all files written to a provided OPFS root with correct bytes
- [X] T013 [P] Implement `apps/studio/src/opfs/tar-untar.ts` (pako + small tar parser, runs inside a Web Worker) passing T012. Bundle-size budget: ≤ 40KB gzipped
- [X] T014 Write failing test `apps/studio/tests/workspace/persistence.test.ts` covering `WorkspaceRecord` roundtrip through IndexedDB (`workspaces`, `recents`, `settings`, `handles` stores per data-model §1)
- [X] T015 Implement `apps/studio/src/workspace/persistence.ts` using `idb` to satisfy T014; expose typed `saveWorkspace`, `loadWorkspace`, `listRecents`, `deleteWorkspace`
- [X] T016 [P] Write failing test `apps/studio/tests/workspace/multi-tab-broadcast.test.ts` verifying BroadcastChannel ownership: first tab claims, second tab sees claim and flips to read-only, takeover flushes
- [X] T017 [P] Implement `apps/studio/src/services/multi-tab-broadcast.ts` satisfying T016
- [X] T018 Write failing test `apps/studio/tests/workspace/workspace-manager.test.ts` covering create / open / close / delete lifecycle and the cross-tab ownership contract from T016
- [X] T019 Implement `apps/studio/src/workspace/workspace-manager.ts` wiring persistence (T015) + opfs-fs (T011) + multi-tab (T017). Zustand store in `workspace-store.ts` surfaces the active workspace + recents to React.

### 2b. Telemetry client (no-op stub; worker ingest lands in Polish)

- [X] T020 [P] Write failing test `apps/studio/tests/services/telemetry.test.ts`: payload matches `contracts/telemetry-event.md` schema, `localhost` is a no-op, `telemetry-enabled=false` is a no-op, each event type emits correctly
- [X] T021 Implement `apps/studio/src/services/telemetry.ts` passing T020; the endpoint URL is env-driven (`VITE_TELEMETRY_URL`) and defaults to off in dev

### 2c. Design tokens baseline

- [X] T022 [P] Populate `packages/design-tokens/src/tokens.json` with the namespaces locked in data-model §5 (color, font, spacing, radius, shadow, motion, z-index) at the **values Studio currently uses** — this is a migration into tokens, not a redesign
- [X] T023 Implement `packages/design-tokens/src/build.ts` — emits `dist/tokens.css` (`:root{...}` + `[data-theme=dark]{...}`) and `dist/tokens.ts` (typed `as const`)
- [X] T024 [P] Write snapshot test `packages/design-tokens/tests/build.test.ts` asserting the emitted CSS contains every required variable name

**Checkpoint**: `pnpm -r test` passes for `@rune-langium/design-tokens` and for `apps/studio` OPFS + workspace + telemetry units. No user-story code yet.

---

## Phase 3 — US1: Demo content actually loads on the deployed site (Priority: P1)

**Goal**: Curated models load reliably on the deployed CF site in ≤60s first-time, ≤5s cached, with a distinct error per failure mode.

**Independent test**: Visit `https://www.daikonic.dev/rune-studio/` in a clean browser, pick CDM, observe workspace populates and editor opens the entry point. Repeat for FpML and rune-dsl. Verify a forced network failure surfaces a specific error, not an indefinite spinner.

### 3a. Curated-mirror Worker (server side)

- [X] T025 [US1] Write failing contract test `apps/curated-mirror-worker/test/publisher.test.ts` using a mocked `fetch` + mocked R2 client: asserts the publisher downloads from `codeload.github.com/{owner}/{repo}/tar.gz/refs/heads/{ref}`, uploads to `archives/<yyyy-mm-dd>.tar.gz` and `latest.tar.gz`, writes `manifest.json` conforming to `contracts/curated-mirror-http.md`, and prunes to the most recent 14
- [X] T026 [US1] Implement `apps/curated-mirror-worker/src/publisher.ts` + `src/manifest.ts` + `src/index.ts` (scheduled handler that iterates the curated registry) passing T025
- [X] T027 [US1] Write failing contract test `apps/curated-mirror-worker/test/http.test.ts` covering the route worker added in T008: `GET /curated/<id>/manifest.json` returns 200 with ETag, 304 on `If-None-Match` match, 404 on unknown id; `GET /curated/<id>/latest.tar.gz` streams bytes with `Content-Length`; 404 on missing archive
- [X] T028 [US1] Implement the HTTP handler added in T008 satisfying T027. Apply `Cache-Control: public, max-age=300` on manifest and `public, max-age=86400, immutable` on archives; set `Access-Control-Allow-Origin: https://www.daikonic.dev` on every response
- [X] T029 [US1] [P] Add structured-log rules (pino with redact set matching `apps/codegen-worker`) in `apps/curated-mirror-worker/src/log.ts`

### 3b. Curated loader (client side)

- [X] T030 [US1] [P] Write failing test `apps/studio/tests/services/curated-loader.test.ts` that uses the T012 fixture archive + the T020 telemetry spy; asserts: (a) manifest HEAD-style freshness check fires, (b) archive fetch streams into untar + OPFS writes, (c) success emits `curated_load_success` with `durationMs`, (d) each failure mode in `contracts/curated-mirror-http.md` surfaces the right `ErrorCategory`, (e) cancellation aborts and leaves no half-written files
- [X] T031 [US1] Implement `apps/studio/src/services/curated-loader.ts` passing T030. Uses `opfs-fs` (T011), `tar-untar` (T013), `telemetry` (T021). Exposes a `loadCurated(modelId, { signal, onProgress })` function that returns `Promise<WorkspaceFile[]>`
- [X] T032 [US1] [P] Write failing test `apps/studio/tests/services/model-registry.test.ts` asserting the curated registry still exposes CDM/FpML/rune-dsl as three entries but now with `archiveUrl` derived from the mirror manifest instead of `repoUrl`/`ref`
- [X] T033 [US1] Refactor `apps/studio/src/services/model-registry.ts` to match T032. `repoUrl` / `ref` fields remain on the type for the custom-URL flow (FR-007) but the curated entries no longer use them at load time
- [X] T034 [US1] Rewrite `apps/studio/src/services/model-loader.ts` as a thin façade: curated IDs route to `curated-loader`, arbitrary URLs continue to route to the existing `isomorphic-git` path. Keep the existing progress / cancellation API surface intact — callers don't change
- [X] T035 [US1] [P] Write failing test `apps/studio/tests/services/stale-while-revalidate.test.ts` asserting FR-005a: cached copy opens immediately, background freshness check fires, a newer manifest surfaces an `updateAvailable: true` without touching local edits
- [X] T036 [US1] Implement the stale-while-revalidate behaviour in `curated-loader` per T035. Exposes `checkFreshness(modelId): Promise<{ updateAvailable: boolean; remoteVersion: string }>`

### 3c. Error UX

- [X] T037 [US1] [P] Write failing integration test `apps/studio/tests/components/CuratedLoadErrorPanel.test.tsx` — renders the mapped message for each `ErrorCategory`, includes a retry button, never shows a generic "unknown error" string
- [X] T038 [US1] Implement `apps/studio/src/components/CuratedLoadErrorPanel.tsx` satisfying T037
- [X] T039 [US1] Wire `CuratedLoadErrorPanel` into the existing `ModelLoader` component so FR-002 failure modes render with specific, actionable copy

**Checkpoint (US1 MVP)**: end-to-end smoke via `pnpm --filter @rune-langium/studio test:e2e -- curated-load` hits a mocked R2 fixture, loads all three curated models, and asserts workspace populates. This alone is a shippable bug-fix of the user's main complaint.

---

## Phase 4 — US2: Persistent multi-file workspaces (Priority: P2)

**Goal**: Workspaces persist (files, tabs, active tab, dirty buffers), support folder-backed (FSA) and GitHub-backed modes, and roundtrip edits.

**Independent test**: Load a curated model, edit two files, close the browser, reopen — all edits, open tabs, active tab, and scroll positions restored in ≤5s (SC-002/SC-004).

### 4a. LightningFS cut-clean migration (FR-017, one-shot)

- [X] T040 [US2] Write failing test `apps/studio/tests/workspace/lightningfs-migration.test.ts` with a seeded legacy `fs` IndexedDB DB — asserts: all files move to OPFS under a generated default workspace, `CuratedModelBinding`s are populated where the legacy cache had known curated paths, and both legacy IndexedDB DBs (`fs`, `lightning-fs-cache`) are deleted in the same pass
- [X] T041 [US2] Implement `apps/studio/src/workspace/migrations/lightningfs-to-opfs.ts` passing T040. Runs on first boot if `settings.design-system-version` is missing or older than this feature's version
- [X] T042 [US2] [P] Write failing test covering the migration's failure path: IndexedDB walk throws partway — `"Export legacy data"` zip is produced and the legacy DB is kept until the user confirms discard
- [X] T043 [US2] Implement the export-legacy-data affordance in `apps/studio/src/components/LegacyExportDialog.tsx` + wire to the migration from T041
- [X] T044 [US2] Remove `@isomorphic-git/lightning-fs` from `apps/studio/package.json` dependencies; run `pnpm install`; ensure `pnpm why @isomorphic-git/lightning-fs` returns nothing. Remove the old `LightningFS` imports in `apps/studio/src/services/model-loader.ts`

### 4b. Multi-file + tab restore (FR-010–015)

- [X] T045 [US2] Write failing test `apps/studio/tests/workspace/tab-restore.test.ts`: multiple files opened as tabs, active tab, per-tab scroll/cursor — all round-trip through `WorkspaceRecord.tabs` + `/.studio/scratch.json`
- [X] T046 [US2] Implement tab state persistence in `apps/studio/src/workspace/tab-state.ts` satisfying T045; hook the editor component's `onDidChangeCursorPosition` / `onDidScrollChange` with a debounced writer
- [X] T047 [US2] [P] Write failing test `apps/studio/tests/workspace/crash-recovery.test.ts`: dirty buffer written to `/.studio/dirty/<encoded-path>` during edit, simulated kill, next open restores the dirty content
- [X] T048 [US2] Implement the dirty-buffer shadow writer in `apps/studio/src/workspace/dirty-buffer.ts` satisfying T047. Cleared on save/discard

### 4c. Folder-backed workspaces (FSA)

- [X] T049 [US2] [P] Write failing test `apps/studio/tests/workspace/folder-backed.test.ts` using the FSA mock in `apps/studio/tests/setup/fsa-mock.ts`: creating a workspace from a folder handle stores the handle via `handles` IndexedDB store (data-model §1.4), edits round-trip to the real directory, permission revocation switches to read-only
- [X] T050 [US2] Implement `apps/studio/src/workspace/folder-backing.ts` satisfying T049. Wire the "New from folder" UI flow

### 4d. GitHub-backed workspaces (FR-008, R6, device flow)

- [X] T051 [US2] Write failing contract test `apps/github-auth-worker/test/device-flow.test.ts` against a mocked GitHub API: `POST /device-init` forwards to `/login/device/code`, `POST /device-poll` forwards to `/login/oauth/access_token` and maps the three documented states (pending → 202, success → 200, expired → 410)
- [X] T052 [US2] Implement `apps/github-auth-worker/src/index.ts` + `src/log.ts` satisfying T051. Origin allowlist `https://www.daikonic.dev` enforced; 403 anything else
- [X] T053 [US2] [P] Write failing test `apps/studio/tests/services/github-auth.test.ts`: the client hits `device-init`, renders the user code, polls with backoff respecting the `interval` field, writes the final token to `<workspace-id>/.studio/token` in OPFS
- [X] T054 [US2] Implement `apps/studio/src/services/github-auth.ts` satisfying T053
- [X] T055 [US2] Write failing test `apps/studio/tests/services/git-backing.test.ts` using `isomorphic-git` against OPFS: clone a small fixture repo, edit a file, commit, push (mocked HTTP), status-bar state machine `clean → ahead → clean`
- [X] T056 [US2] Implement `apps/studio/src/services/git-backing.ts` satisfying T055. Uses OPFS-shaped FS from T011 as the isomorphic-git `fs`
- [X] T057 [US2] [P] Write failing test `apps/studio/tests/components/GitHubConnectDialog.test.tsx` for the device-flow UI component
- [X] T058 [US2] Implement `apps/studio/src/components/GitHubConnectDialog.tsx` + "Commit & push" modal satisfying T057

### 4e. Workspace list + switcher UI

- [X] T059 [US2] [P] Write failing test `apps/studio/tests/components/WorkspaceSwitcher.test.tsx`: renders from the `recents` IndexedDB store sorted by `lastOpenedAt` desc, supports create / open / rename / delete, distinguishes the three `kind`s visually
- [X] T060 [US2] Implement `apps/studio/src/components/WorkspaceSwitcher.tsx` satisfying T059; mount it into the activity bar slot (placeholder until US3 lands the real activity bar)

**Checkpoint (US2)**: workspace state survives browser restart; folder-backed workspaces round-trip; GitHub-backed workspaces clone, commit, push; legacy `LightningFS` dep is gone.

---

## Phase 5 — US3: IDE-style dockable layout (Priority: P3)

**Goal**: Replace the fixed-frame editor with a `dockview-react` shell that has six named panels, persistent per-workspace layout, keyboard a11y, and small-viewport defaults.

**Independent test**: Resize and rearrange panels into a non-default configuration, reload the page, confirm exact restoration. At 1280×800, editor ≥70% of horizontal space in default layout (SC-005). Full keyboard-only walkthrough reaches every panel with no trap (SC-010).

### 5a. Layout scaffolding

- [X] T061 [US3] Write failing test `apps/studio/tests/shell/layout-factory.test.ts`: the factory produces a `PanelLayoutRecord` with the six named components (`workspace.fileTree`, `.editor`, `.inspector`, `.problems`, `.output`, `.visualPreview`), default sizes honour the small-viewport rules in FR-024, `version === 1`
- [X] T062 [US3] Implement `apps/studio/src/shell/layout-factory.ts` satisfying T061
- [X] T063 [US3] [P] Write failing test `apps/studio/tests/shell/layout-migrations.test.ts`: a legacy layout with an unknown `componentName` is sanitised (unknown dropped, defaults filled), bumped-version layouts run the right transformer
- [X] T064 [US3] Implement `apps/studio/src/shell/layout-migrations.ts` satisfying T063
- [X] T065 [US3] Implement `apps/studio/src/shell/DockShell.tsx` — mounts `dockview-react`, wires layout load/save to `workspace-manager`, applies the six-panel defaults from T062. Layout JSON persisted via `api.toJSON()` / `api.fromJSON()` on every change (debounced)

### 5b. Individual panels

- [X] T066 [US3] [P] Implement `apps/studio/src/shell/panels/FileTreePanel.tsx` with a virtualised tree over the active workspace; keyboard-operable per FR-A02
- [X] T067 [US3] [P] Implement `apps/studio/src/shell/panels/EditorPanel.tsx` — Monaco host with tabbed document group, drag-to-reorder, close on middle-click, dirty indicator distinct from close affordance (FR-026)
- [X] T068 [US3] [P] Implement `apps/studio/src/shell/panels/InspectorPanel.tsx` — empty shell at this point; forms plug in during Phase 7 (US5)
- [X] T069 [US3] [P] Implement `apps/studio/src/shell/panels/ProblemsPanel.tsx` surfacing `WorkspaceState.errors`
- [X] T070 [US3] [P] Implement `apps/studio/src/shell/panels/OutputPanel.tsx` — shows codegen / LSP output
- [X] T071 [US3] [P] Implement `apps/studio/src/shell/panels/VisualPreviewPanel.tsx` wrapping the existing visual editor entry component

### 5c. Chrome and keyboard

- [X] T072 [US3] Implement `apps/studio/src/shell/ActivityBar.tsx` — hosts workspace switcher (T060), model registry entry point, settings. Always visible, outside dockview
- [X] T073 [US3] Implement `apps/studio/src/shell/StatusBar.tsx` — workspace name, git status (for git-backed), LSP status, telemetry toggle shortcut
- [X] T074 [US3] Write failing test `apps/studio/tests/shell/keyboard.test.ts` asserting every shortcut in `contracts/dockview-panel-registry.md`'s keyboard contract
- [X] T075 [US3] Implement `apps/studio/src/shell/keyboard.ts` using a single hotkey layer that dispatches against the dockview API; register shortcuts in `DockShell`
- [X] T076 [US3] [P] Wire the ARIA roles from `contracts/dockview-panel-registry.md` §Accessibility roles into each panel + splitter + tablist; assert via `axe-core` in T088
- [ ] T077 [US3] Replace `apps/studio/src/pages/EditorPage.tsx` to mount `DockShell` instead of the current fixed two-panel layout. Delete the obsolete layout code paths in the same commit. **DEFERRED** — landing the dock shell primitives + panels first; the full EditorPage swap unwinds RuneTypeGraph + LSP + expression builder mountpoints and warrants its own focused PR.

### 5d. Reset-layout + small viewport

- [X] T078 [US3] [P] Write failing test `apps/studio/tests/shell/reset-layout.test.ts`: "Reset layout" replaces `WorkspaceRecord.layout` with the factory default without touching `files`, `tabs`, or `curatedModels`
- [X] T079 [US3] Implement the reset-layout action in `DockShell`'s command palette
- [X] T080 [US3] [P] Write failing test `apps/studio/tests/shell/small-viewport.test.ts` at 1280×800: editor area ≥70% of horizontal space, inspector and bottom panel collapsed by default
- [X] T081 [US3] Confirm T080 passes given T062's factory defaults; adjust factory if needed
- [X] T082 [US3] [P] Write failing test `apps/studio/tests/shell/mobile-portrait.test.ts`: at <768px viewport width, `<UnsupportedViewport />` renders instead of `DockShell`
- [X] T083 [US3] Implement `apps/studio/src/components/UnsupportedViewport.tsx` and gate `DockShell` on a `useViewport()` hook

**Checkpoint (US3)**: the dockable shell is mounted, six panels are functional, layout persists, keyboard-only walkthrough passes, `axe-core` has no serious/critical violations on the shell.

---

## Phase 6 — US4: One product, three surfaces (Priority: P4)

**Goal**: Studio, docs (VitePress), and landing site share typography, colour, spacing, buttons, links, focus. Studio's chrome budget drops ≥25% at 1280×800.

**Independent test**: Screenshot comparable primitives across the three surfaces and have an outside reviewer identify them as "same product" (SC-007). Measure Studio chrome-vertical-pixel budget before/after (SC-006).

- [X] T084 [US4] Capture baseline chrome-vertical-pixel budget from current `master` Studio at 1280×800. Record in `specs/012-studio-workspace-ux/baseline-measurements.md` for SC-006 delta comparison
- [X] T085 [US4] Expand `packages/design-system/` to include primitives used by all three surfaces: `Button`, `Link`, `Input`, `Heading`, `CodeBlock`, `Card`, `Toast`, `Dialog`, `Tabs`. Each is typed, a11y-checked, token-driven (reads `@rune-langium/design-tokens`). Write contract tests for each primitive
- [X] T086 [US4] [P] Wire VitePress custom theme at `apps/docs/.vitepress/theme/tokens.css` to import `@rune-langium/design-tokens/dist/tokens.css`. Update the theme's overrides for typography, colour, and link styles to use tokens
- [ ] T087 [US4] [P] Wire `apps/site/` (landing) to import `@rune-langium/design-tokens/dist/tokens.css` at the app root. Swap the landing page's primary CTA to the shared `<Button>` from `@rune-langium/design-system`
- [X] T088 [US4] Integrate `axe-core` into Studio's playwright config (`apps/studio/playwright.config.ts`); fail CI on serious/critical violations in code we own (skip Monaco iframe)
- [X] T089 [US4] Update Studio's Tailwind config (`apps/studio/tailwind.config.ts`) to read its colour + spacing scales from `@rune-langium/design-tokens`. Remove ad-hoc colour literals in components; replace with token references
- [ ] T090 [US4] Swap Studio's own buttons / inputs / headings for the shared primitives from T085. Remove the duplicates from `apps/studio/src/components/ui/*` where the shared primitive subsumes them. Update import paths
- [ ] T091 [US4] Reduce Studio's header chrome — remove the duplicated site nav that currently appears on top of the dock shell. Re-measure chrome-vertical-pixel budget; SC-006 requires ≥25% drop vs T084 baseline
- [X] T092 [US4] [P] Add a shared cross-app navigation component: `<AppSwitcher>` in `@rune-langium/design-system` that renders links to Home / Docs / Studio. Mount it in all three surfaces
- [X] T093 [US4] Write failing test `apps/studio/tests/design-system/cross-app-snapshot.test.tsx`: renders the shared `<Button>` from the primitive and asserts the rendered computed CSS against the token values. A regression in either the token or the primitive fails this test
- [ ] T094 [US4] Run the manual cross-surface screenshot review per quickstart.md §6 and attach results as `specs/012-studio-workspace-ux/ux-review.md` for the PR reviewer

**Checkpoint (US4)**: tokens + primitives shared across three surfaces; SC-006 chrome-budget reduction measured; SC-007 outside reviewer confirms coherence.

---

## Phase 7 — US5: Modernised form codegen via the Vite plugin (Priority: P5)

**Goal**: `@zod-to-form/*` upgraded 0.4→0.7.1, `@zod-to-form/vite` plugin wired, CLI-generated files deleted, HMR on schema edit, no separate codegen step.

**Independent test**: Fresh checkout → `pnpm dev:studio` → form renders with no `forms/generated/*` files committed, no separate CLI invocation; editing a Zod schema triggers form HMR in ≤2s (SC-011).

### 7a. Upstream audit (FR-Z06)

- [ ] T095 [US5] Conduct the FR-Z06 audit: read `/Users/pmouli/GitHub.nosync/active/ts/zod-to-form/packages/{core,react,vite}/README.md`, `packages/*/examples/`, and `specs/007-vite-codegen-plugin/` in the upstream repo; enumerate every divergence in current rune-langium consumption and record in `specs/012-studio-workspace-ux/z2f-audit.md`. Flag each divergence as `workaround-to-remove` or `deliberate-keep-with-rationale`

### 7b. Breaking-change remediation

- [ ] T096 [US5] [P] Rewrite `packages/visual-editor/src/components/forms/MapFormRegistry.ts` to import `ZodFormRegistry` directly from `@zod-to-form/core` (0.7.x exports it cleanly) and drop the local `ZodFormRegistryLike` shim
- [ ] T097 [US5] [P] Rename every `fieldType` reference to `component` across `packages/visual-editor/src/` (0.6.0 breaking change). Search-all-replace: `fieldType:` → `component:`, `fieldType"` → `component"`, etc. Validate with a grep that no `fieldType` remains
- [ ] T098 [US5] Update `packages/visual-editor/z2f.config.ts` to the 0.7.x schema (verify against upstream's canonical example identified in T095)

### 7c. Vite plugin wiring

- [ ] T099 [US5] Add `@zod-to-form/vite` plugin to `apps/studio/vite.config.ts` (position BEFORE `react()` per upstream quickstart §2)
- [ ] T100 [US5] Add `@zod-to-form/vite/client` to the `types` array in `apps/studio/tsconfig.json` so `?z2f` imports are typed
- [ ] T101 [US5] [P] Add the same plugin + type wiring to `packages/visual-editor/vitest.config.ts` so unit tests of forms keep working

### 7d. Call-site migration + delete committed output

- [ ] T102 [US5] Write failing test `packages/visual-editor/tests/forms/dataform-roundtrip.test.tsx` that imports `schemas/data.schema.ts?z2f` and asserts the rendered form has the same fields + behaviours as the pre-migration `DataForm` baseline
- [ ] T103 [US5] Migrate every call site of the five committed forms (`DataForm`, `ChoiceForm`, `RosettaEnumerationForm`, `RosettaFunctionForm`, `RosettaTypeAliasForm`) to `?z2f` imports in the files under `packages/visual-editor/src/components/editors/`; update default-import style per upstream quickstart
- [ ] T104 [US5] **Delete** `packages/visual-editor/src/components/forms/generated/` directory entirely in the same commit as T103. Add a `.gitignore` rule for `**/forms/generated/` to prevent accidental future regeneration being committed
- [ ] T105 [US5] Remove the five `scaffold:*Form` scripts and the umbrella `scaffold:forms` script from `packages/visual-editor/package.json`. Remove `@zod-to-form/cli` from `devDependencies`; run `pnpm install`
- [ ] T106 [US5] Wire the migrated forms into `InspectorPanel` (from T068): the inspector reads the active node's schema from the workspace model and renders the corresponding `?z2f` form

### 7e. HMR + CI verification

- [ ] T107 [US5] [P] Write failing e2e test `apps/studio/tests/e2e/z2f-hmr.spec.ts` (Playwright): start dev server, open a schema file, add a field, assert the inspector updates within 2s (SC-011)
- [ ] T108 [US5] Update `.github/workflows/ci.yml` (or wherever the Studio build runs) to confirm no standalone codegen step; the build is pure `pnpm build`

**Checkpoint (US5)**: `git status` clean on a fresh checkout shows no `forms/generated/*`; HMR works; CI builds with no separate codegen phase.

---

## Phase 8 — Polish & Cross-Cutting Concerns

Final verification, telemetry ingest, a11y gates, perf benches, docs.

### 8a. Telemetry Worker (server side)

- [ ] T109 Write failing contract test `apps/telemetry-worker/test/ingest.test.ts` against `contracts/telemetry-event.md`: 204 on valid body, 400 on schema violation, 400 on extra field, 429 after 10/min/IP, daily-rotating IP hash never logged raw
- [ ] T110 Implement `apps/telemetry-worker/src/index.ts` + `src/counters.ts` (Durable Object `TelemetryAggregator` keyed on `<event-name>:<UTC-day>`) satisfying T109
- [ ] T111 [P] Add structured-log rules in `apps/telemetry-worker/src/log.ts` matching the `apps/codegen-worker` redact set
- [ ] T112 Expose `GET /v1/stats` behind CF Access (admin allowlist). Not user-accessible
- [ ] T113 Update `apps/studio/src/services/telemetry.ts` to point at the deployed worker URL; keep the `localhost` no-op check

### 8b. Accessibility gates

- [ ] T114 Document the manual keyboard-only walkthrough checklist in `specs/012-studio-workspace-ux/a11y-walkthrough.md` — one check per panel, per FR-A02–A05
- [ ] T115 [P] Run `axe-core` in CI against all new routes (Studio home, workspace open, settings, dialogs). Fail on serious/critical. Record any Monaco-owned violations as known caveats, not gates
- [ ] T116 Execute the manual walkthrough from T114 and attach results to the PR

### 8c. Performance benchmarks

- [ ] T117 [P] Add bench `packages/core/benchmarks/opfs-write.bench.ts` measuring OPFS write throughput for a fixture 500-file tree; record the baseline. Must complete within Principle IV latency budgets
- [ ] T118 [P] Add bench `apps/studio/tests/bench/curated-load.bench.ts` simulating a cold load from a mocked R2 fixture end-to-end; record cold + warm times against SC-001 / SC-002 targets
- [ ] T119 [P] Add bench `apps/studio/tests/bench/workspace-restore.bench.ts` for the multi-file + multi-tab restore path; verify ≤5s at SC-002 target

### 8d. Docs + runbook

- [ ] T120 Add `specs/012-studio-workspace-ux/deploy-runbook.md` following the pattern of `specs/011-export-code-cf/deploy-runbook.md`: manual steps for wrangler login, first R2 upload, telemetry Worker secrets, GitHub App creation for device flow, smoke-test commands
- [ ] T121 [P] Update `apps/studio/README.md` with workspace + GitHub-backing + telemetry settings sections
- [ ] T122 [P] Update root `README.md` "Active Technologies" list to reflect OPFS, dockview, design-tokens, three new Workers
- [ ] T123 [P] Update the landing site (`apps/site/`) Feature pane to mention the new "Open a GitHub repo as a workspace" capability

### 8e. Final verification

- [ ] T124 Run the full quickstart flow end-to-end on a clean browser profile against a preview deployment; tick every scenario in `quickstart.md` §1–§8
- [ ] T125 Verify SC-001, SC-002, SC-004, SC-005, SC-006, SC-007, SC-009, SC-010, SC-011 each have a named, passing test or measurement

---

## Dependencies

```
Phase 1 (Setup) ──▶ Phase 2 (Foundational) ──┬──▶ Phase 3 (US1) ──┐
                                              │                    │
                                              │                    ▼
                                              ├──▶ Phase 4 (US2) ──┬──▶ Phase 5 (US3) ──▶ Phase 7 (US5) ──▶ Phase 8 (Polish)
                                              │                    │                                          ▲
                                              │                    ▼                                          │
                                              └──▶ Phase 6 (US4 — can start after Phase 5 T065, parallel-ish with US5)
```

- **US1 gating**: needs Phase 2 OPFS + telemetry stub, plus the mirror Worker from Phase 3a. It is the MVP — shippable on its own without US2–US5.
- **US2 gating**: US1 provides the OPFS + curated-loader primitives that `WorkspaceFile` models rely on.
- **US3 gating**: needs US2's workspace primitives to host; the panel stubs are mountable earlier but real content requires workspaces.
- **US4 gating**: design-tokens package (Phase 2c) must exist; primitives (T085) feed into US3 panels. Chrome-reduction (T091) requires US3's `DockShell` (T065) to replace the old chrome.
- **US5 gating**: `InspectorPanel` (T068, US3) is where the migrated forms mount. US5 can technically migrate the packages earlier but the Inspector wiring needs US3.

## Parallel execution opportunities

Most `[P]` markers within a phase are parallelisable. Notable batches:

- **T001–T005** (setup scaffolding across 4 new packages/apps + R2 bucket) can all run in parallel.
- **T025 + T030 + T037** (US1 server + client + UX tests) can be written in parallel before the implementation pairs.
- **T066–T071** (six panels in Phase 5b) all live in different files and don't depend on each other — true parallel.
- **T086 + T087 + T092** (three surfaces wire the shared design-system) can proceed concurrently.
- **T117–T119** (three benchmarks in Phase 8c) parallel.

## Implementation strategy

- **MVP = Phase 1 + Phase 2 + Phase 3 (US1)**. This alone fixes the user's "CDM corpus glitches on CF" complaint (FR-001) and ships with useful telemetry scaffolding. Approximately 39 tasks, roughly 1–2 weeks of focused work.
- **Incremental v1.1 = Phase 4 (US2)**. Workspaces + GitHub backing. Approximately 21 tasks.
- **Incremental v1.2 = Phase 5 (US3) + Phase 6 (US4)**. Dock shell + design-system. Approximately 34 tasks. Ship together because the chrome-reduction measurement (T091) only makes sense once both are in.
- **Incremental v1.3 = Phase 7 (US5)**. Form codegen migration. 14 tasks, opportunistic with US3 because inspector hosts the forms.
- **v1.4 = Phase 8 (Polish)**. Telemetry worker, a11y gates, perf benches, deploy runbook. 17 tasks. Cross-cuts everything.

Total: **125 tasks** across 8 phases. US1 alone is shippable.

## Format validation

Every task above conforms to `- [ ] Txxx [P?] [USx?] Description with file path(s)`:

- Checkbox `- [ ]` ✅
- Sequential `Txxx` ✅ (T001–T125, gapless)
- `[P]` where parallelisable ✅
- `[USx]` on every task in Phase 3–7 ✅; absent on Phase 1, 2, 8 ✅
- File path in every description ✅
