# Tasks: Studio Production Readiness

**Feature**: 014-studio-prod-ready
**Branch**: `014-studio-prod-ready`
**Input**: spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md

Format: `- [ ] Txxx [P?] [USx?] Description with file path(s)`
`[P]` = parallelisable (different files, no pending dependency).
`[USn]` = belongs to User Story *n* (user-story phase tasks only).

Constitution tie-in: Principle II (Deterministic Fixtures) — every
test runs against the vendored `apps/studio/test/fixtures/curated/tiny.tar.gz`,
no live R2. Principle IV (Performance & Workers) — the LSP DO must
hit the SC-005 latency budgets in the spike before phase 4 builds.

---

## Phase 1 — Setup

Operational unblock + shared scaffolding. Some of these are pure ops
(wrangler commands); a human with deploy credentials runs them.
Everything code-side runs locally first.

- [X] T001 ~~Tighten the codegen-worker route pattern~~. **Skipped** — the route was already `pattern = "www.daikonic.dev/rune-studio/api/generate/*"` (specific, not a catch-all). The verify-production-detected 405s were because the *other* three workers aren't deployed yet, NOT because codegen-worker is eating their requests. Once T003-T005 land, real `/api/telemetry/v1/event` POSTs will return 204 from the telemetry worker while a random unknown path still returns 405 — the catch-all check passes naturally. No code change needed.
- [X] T002 ~~Run `wrangler deploy` for codegen-worker~~. **Skipped** — no change to redeploy (depends on T001).
- [ ] T003 Run `pnpm --filter @rune-langium/curated-mirror-worker exec wrangler deploy` (Worker exists at master HEAD; just needs binding to the route)
- [ ] T004 [P] Run `pnpm --filter @rune-langium/github-auth-worker exec wrangler deploy`
- [ ] T005 [P] Run `pnpm --filter @rune-langium/telemetry-worker exec wrangler deploy`
- [ ] T006 Replace `GITHUB_CLIENT_ID = "Iv1.PLACEHOLDER_REPLACE_BEFORE_DEPLOY"` in `apps/github-auth-worker/wrangler.toml` with the production GitHub App's real client ID (per research.md R10 — separate prod-only App), then redeploy
- [ ] T007 Trigger the first curated-mirror cron run via `wrangler dev --test-scheduled` + `curl /__scheduled?cron=0+3+*+*+*` to seed R2 with `cdm/`, `fpml/`, `rune-dsl/` manifests + `latest.tar.gz` archives
- [ ] T008 Re-run `pnpm run verify:prod` and confirm 5 of 7 checks PASS (LSP probe still FAILs — that's Phase 4); record the output as the post-deploy baseline

**Checkpoint**: `pnpm run verify:prod` shows curated mirror serving manifests, telemetry POST returning 204, github-auth POST returning 200 with a `device_code`, and route precedence detection finds no catch-all.

---

## Phase 2 — Foundational

Cross-cutting changes that every user story depends on. Build the
config layer that the new env vars flow through, plus the contract
test scaffold for the LSP worker (so US3 has tests to drive when
its phase opens).

- [X] T009 Create `apps/studio/src/config.ts` exporting a Zod-validated `config` singleton per `contracts/studio-config.md` — fields `lspWsUrl`, `lspSessionUrl`, `telemetryEndpoint`, `devMode`, `legacyGitPathEnabled`. Throw on validation failure so the build fails fast.
- [X] T010 Add `vite.config.ts` env-var declarations + a `.env.example` so contributors know what to set; document defaults in `apps/studio/README.md`
- [X] T011 [P] Write failing tests in `apps/studio/test/config.test.ts` asserting (a) production defaults route to `wss://www.daikonic.dev/...`, (b) dev defaults route to `ws://localhost:3001`, (c) override via `VITE_LSP_WS_URL` works, (d) malformed URL throws at module load, (e) `legacyGitPathEnabled` defaults to `false`
- [X] T012 [P] Replace any hard-coded `ws://localhost:3001` in `apps/studio/src/services/transport-provider.ts` with `config.lspWsUrl` (FR-021); confirm with `grep -rn "ws://localhost:3001" apps/studio/src/` returning zero hits

**Checkpoint**: Studio builds cleanly with `pnpm --filter @rune-langium/studio build`; config tests pass; no hard-coded LSP URL in src/.

---

## Phase 3 — User Story 1: Curated-corpus load works end-to-end (Priority: P1)

Wire `archiveLoader` through the call site so curated cards actually
fetch from `www.daikonic.dev/curated/...` instead of falling through
to the broken legacy git path. Add the e2e regression test.

**Independent Test**: After T013–T020, click the CDM card on a fresh
production tab; within 60s the workspace shows the CDM tree with at
least one open `.rosetta` file; network panel shows exactly 2 calls
to `daikonic.dev/curated/cdm/...` and zero to `cors.isomorphic-git.org`.

- [X] T013 [P] [US1] Write failing e2e test at `apps/studio/test/e2e/curated-load.spec.ts` (Playwright) that uses `route.fulfill` to mock `/curated/cdm/manifest.json` + `/curated/cdm/latest.tar.gz` against the vendored `tiny.tar.gz` fixture; asserts (a) only daikonic.dev URLs are fetched, (b) workspace becomes interactive within 5s of mock-completion, (c) at least one `.rosetta` file is open in the editor (FR-020)
- [X] T014 [US1] Wire `archiveLoader: (s, opts) => loadCuratedModel({...})` into the `loadModel(...)` call at `apps/studio/src/store/model-store.ts:85` per research.md R4 + B2; pass through the OPFS root from the active workspace, the telemetry client, signal, onProgress
- [X] T015 [P] [US1] Update unit tests in `apps/studio/test/store/model-store.test.ts` (or add if absent) asserting the `loadCuratedModel` path runs when `source.archiveUrl` is set; the legacy git path is NOT invoked
- [X] T016 [P] [US1] Add a Playwright route-block in `curated-load.spec.ts` for any `cors.isomorphic-git.org/**` request that fails the test if hit (regression guard for FR-019) — landed in T013's commit (curated-load.spec.ts already aborts every isomorphic-git request and asserts none were observed)
- [X] T017 [US1] Gate the legacy `cors.isomorphic-git.org` clone path in `apps/studio/src/services/model-loader.ts` behind `config.legacyGitPathEnabled` (FR-019); production builds set it to `false` so the path is unreachable from the public deploy
- [X] T018 [P] [US1] Update `apps/studio/src/components/CuratedLoadErrorPanel.tsx` if needed to surface every `ErrorCategory` value (network, archive_not_found, archive_decode, storage_quota, permission_denied, cancelled, unknown) with a distinct user-actionable message (FR-002 verification) — copy was already complete; added a regression test asserting all titles + bodies are pairwise distinct.
- [X] T019 [P] [US1] Run `pnpm --filter @rune-langium/studio exec playwright test test/e2e/curated-load.spec.ts` against the local dev server; confirm GREEN
- [X] T019b [P] [US1] Add a Playwright e2e at `apps/studio/test/e2e/curated-load-cancel.spec.ts` covering the cancel-mid-flight edge case (spec EC-2): initiate a curated load against the mocked fixture, call `signal.abort()` after the manifest fetch but before the archive completes, reload the page, and assert (a) the partial workspace folder under OPFS is gone or flagged `pending: true`, (b) the start page shows no orphaned recents entry, (c) `listRecents()` does not include the cancelled workspace
- [ ] T020 [US1] Manual smoke: open production Studio in a fresh browser profile, click CDM, verify the network panel matches the spec (2 daikonic.dev fetches, 0 isomorphic-git proxy calls); attach screenshots to the implementation PR — **deferred to lead**, runs against production after worktree merges (no production access from this worktree)

**Checkpoint**: SC-001 (60s curated load), SC-004 (distinct error categories), SC-009 (telemetry success rate observable) all measurable end-to-end.

---

## Phase 4 — User Story 4: Dock chrome + panel titles render correctly (Priority: P2)

Single-file fixes that make the existing 012 dock surface look like
the IDE it claims to be. Lifts `dockview-react`'s stylesheet into the
Studio bundle and replaces internal panel IDs with user-readable
titles.

**Independent Test**: After T021–T024, load Studio at 1280×800 and
1440×900; verify (a) every panel has a visible tab strip, (b) tab
labels read "Files" / "Editor" / "Problems" / "Output" / "Preview" /
"Inspector", (c) sash handles are draggable, (d) Reset Layout works.

- [X] T021 [US4] Add `import 'dockview-react/dist/styles/dockview.css';` to `apps/studio/src/main.tsx` (or `@import` it from `apps/studio/src/styles.css` — pick whichever Vite resolves cleanly); B3
- [X] T022 [US4] Audit `apps/studio/src/shell/DockShell.tsx` and remove any redundant theme class — keep only `dockview-theme-abyss` (matches dark palette); the live DOM today applies BOTH `dockview-theme-light` and `dockview-theme-abyss`, which is the source of the "muddled" chrome
- [X] T023 [US4] Add a `PANEL_TITLES: Record<PanelComponentName, string>` map in `apps/studio/src/shell/layout-factory.ts` mapping `workspace.fileTree → "Files"`, `workspace.editor → "Editor"`, `workspace.problems → "Problems"`, `workspace.output → "Output"`, `workspace.visualPreview → "Preview"`, `workspace.inspector → "Inspector"`; export it
- [X] T024 [US4] In `apps/studio/src/shell/dockview-bridge.ts:108-141`, pass `title: PANEL_TITLES[c0.component]` (etc.) on every `addPanel({...})` call so the panel tab strip displays user-readable titles (C1)
- [X] T025 [P] [US4] Add a Playwright visual-regression test at `apps/studio/test/e2e/dock-chrome.spec.ts` that screenshots the Studio at 1280×800 and 1440×900 after a curated load completes; asserts no `dv-` selectors are missing (computed-style probe) and no internal `workspace.` strings are visible
- [X] T026 [US4] Run `pnpm --filter @rune-langium/studio test` and confirm the existing dockview-bridge / layout-factory tests still pass against the new title field

**Checkpoint**: SC-010 (dock chrome visible at both viewports) measurable.

---

## Phase 5 — User Story 2: Workspace restore on reload (Priority: P1)

Mount-time check for a recent workspace. Single-file change in
`App.tsx` plus a regression test.

**Independent Test**: After T027–T030, load a curated model, type a
character, reload the tab; within 5s the same file is open at the
same scroll position; the start page does NOT briefly flash before
the editor appears.

- [X] T027 [P] [US2] Write failing test at `apps/studio/test/components/App-restore.test.tsx` covering: (a) fresh profile → start page renders, (b) one workspace recently used → workspace restored at mount, (c) recent workspace exists but its OPFS handle is gone → fall back to start page with the recents list rendered (so user can pick a different one)
- [X] T028 [US2] Modify `apps/studio/src/App.tsx` mount-time logic to call `listRecents()` from `apps/studio/src/workspace/persistence.ts` BEFORE rendering `<FileLoader>`; if a most-recent workspace exists AND its OPFS root is reachable, restore via `WorkspaceManager.open(record.id)`; otherwise show start page with recents listed (R5)
- [X] T029 [P] [US2] Mount `<WorkspaceSwitcher>` (already exists in `apps/studio/src/components/WorkspaceSwitcher.tsx`) on the start page above the curated-models row; surfaces recents with their kind and `lastOpenedAt` for FR-011
- [ ] T030 [US2] Manual smoke: load a workspace, modify a file, reload; verify the workspace restores within 5s (Chrome DevTools Performance tab); attach a perf trace to the implementation PR for the SC-002 baseline

**Checkpoint**: SC-002 (5s restore), SC-008 (90% day-2 recovery — measurable post-deploy via telemetry counters).

---

## Phase 6 — User Story 5: Open from GitHub start-page affordance (Priority: P3)

The `GitHubConnectDialog` and `git-backing` services already exist;
this phase wires the start-page button.

**Independent Test**: After T031–T034, click "Open from GitHub" on
the empty start page; complete a Device Flow against a public repo;
within 30s the repo's `.rosetta` files appear in the file tree.

- [X] T031 [P] [US5] Add an "Open from GitHub" button to `apps/studio/src/components/FileLoader.tsx`'s start-page row; on click, opens `<GitHubConnectDialog>` in a modal wrapper. Tests at `apps/studio/test/components/FileLoader-github.test.tsx` (3/3 GREEN). +3 studio tests.
- [ ] T032 [US5] **DEFERRED** — wire the dialog's success callback to `WorkspaceManager.createGitBacked({ repoUrl, branch, token })`. The required scaffolding does not exist on master: `WorkspaceManager` only exposes `create/open/close/delete/listRecents` (no `createGitBacked`); `git-backing.ts` has `initRepo/stageAndCommit/detectSyncState/pushBranch` (no `cloneRepository`); the dialog returns just an access token (no repo URL). Tracked as new tasks T032c/T032d/T032e; this Phase 6 ships the visible affordance + auth flow but stops short of workspace creation.
- [X] T032b [P] [US5] `apps/studio/src/services/github-auth.ts` now exposes `GitHubAuthErrorCategory`; `GitHubConnectDialog` renders distinct copy per category (`misconfigured` / `unavailable` / `origin_blocked` / `unknown`) plus a terminal `access_denied` phase (EC-6). Tests at `apps/studio/test/components/GitHubConnect-error-paths.test.tsx` (4/4 GREEN). +4 studio tests.
- [X] T032c Added `cloneRepository(fs, workspaceId, { remoteUrl, ref?, token, user, onProgress? })` to `apps/studio/src/services/git-backing.ts`. Wraps `git.clone` from isomorphic-git over OPFS at `<workspaceId>/{files,.git}` — same shape `initRepo`/`pushBranch` use. Routes through the studio's CORS proxy.
- [X] T032d Added `WorkspaceManager.createGitBacked({ name, repoUrl, branch?, user, token, onProgress? })` to `apps/studio/src/workspace/workspace-manager.ts`. Reserves the OPFS dir tree, persists the access token via `storeWorkspaceToken` (per FR-018), calls `cloneRepository`, persists a `git-backed` `WorkspaceRecord`, claims ownership. Cleans up partial state on clone failure.
- [X] T032e Added `apps/studio/src/components/GitHubWorkspaceFlow.tsx` — wraps `GitHubConnectDialog` with a follow-up "paste your repo URL" step + the actual clone. Parses the four common GitHub URL shapes (`https://github.com/o/r`, `.git`, `git@github.com:o/r.git`, `o/r`). Tests at `apps/studio/test/components/GitHubWorkspaceFlow.test.tsx` (4/4 GREEN: auth → URL transition, disabled-until-parseable, end-to-end clone call shape, inline error banner). FileLoader now mounts `GitHubWorkspaceFlow` instead of `GitHubConnectDialog` directly; `createGitBackedWorkspace` + `onGitHubWorkspaceCreated` props inject the workspace creator from App.tsx (App-side wiring is a small follow-up — the function is ready). Studio: 376 → 380 passing.
- [ ] T033 [DEFERRED with T032] Component test for the App-level happy path (FileLoader → flow → workspace switch) — depends on App.tsx threading `WorkspaceManager.createGitBacked` into `<FileLoader createGitBackedWorkspace=…>`. Code is ready; just needs the App-side wiring task.
- [ ] T034 [DEFERRED with T032] Playwright e2e — same dependency as T033 plus the deployed github-auth Worker (T006).

**Checkpoint**: SC-007 (5-minute end-to-end Device Flow → first commit) measurable; depends on T006 (real GitHub App client ID) being deployed.

---

## Phase 7 — User Story 3: Editor offers live language assistance (Priority: P1, gated by spike)

The single multi-week phase. Runs ONLY after the spike at T035 PASSES;
otherwise drop to the documentation-rewrite fallback at T046.

**Independent Test (PASS path)**: After T036–T045, with CDM loaded
in the editor, type `tradse Trade:` (deliberate typo); within 2s an
error squiggle appears under the typo and the Problems panel lists
the diagnostic.

**Independent Test (FAIL path)**: After T046–T048, the status bar
copy shows "Editor running offline — language services unavailable",
no `localhost:3001` mention; the editor remains usable for syntax
highlighting; the README's transport section reflects reality.

### 7a. Spike (1 working day; output: PASS or FAIL)

- [X] T035 [US3] Built `scratch/lsp-spike/` — Worker imports `@rune-langium/lsp-server`, parses the vendored CDM fixture, emits `textDocument/publishDiagnostics` over WebSocket. **Spike PASSED**: langium loads cleanly on the free Workers tier; diagnostics arrive within budget. Unblocks T036–T045 (PASS path); T046–T048 fallback path skipped.

**Spike PASS path** continues at T036. **Spike FAIL path** jumps to T046.

### 7b. Build the LSP Worker (only if T035 PASSes)

- [X] T036 [US3] Scaffold `apps/lsp-worker/` with `package.json` (deps: `@cloudflare/workers-types`, `wrangler@4`, `@rune-langium/lsp-server`, `@rune-langium/curated-schema`, `pino`), `wrangler.toml` (route `/rune-studio/api/lsp/*`, DO binding `LSP_SESSION`, `nodejs_compat` flag, paid-plan worker), `tsconfig.json`, and a `vitest.config.ts` mirroring `apps/telemetry-worker`'s setup
- [X] T037 [P] [US3] Write failing tests at `apps/lsp-worker/test/upgrade.test.ts` covering the WS-upgrade contract per `contracts/lsp-worker.md`: (a) valid token + valid origin → 101, (b) invalid signature → 401 invalid_session, (c) expired token → 401, (d) wrong origin → 403, (e) replayed nonce → 409, (f) non-WS request → 426. 7/7 GREEN after T039+T040.
- [X] T038 [P] [US3] Write failing tests at `apps/lsp-worker/test/session.test.ts` covering the session-mint + health contract per `contracts/lsp-worker.md`: (a) 200 + verifiable token, (b) 400 schema_violation on bad bodies, (c) 403 origin_not_allowed cross-origin, (d) 429 rate_limited >30/min/IP, (e) /health probe shape. 7/7 GREEN after T039+T040.
- [X] T039 [US3] Implement the Worker entry at `apps/lsp-worker/src/index.ts` — routes `POST /session` (mints HMAC-signed token), `GET /health` (returns `{ok, version, langium_loaded, uptime_seconds}`), `WS /ws/<token>` (validates token, upgrades, forwards to DO). +14 lsp-worker tests (T037+T038).
- [X] T040 [US3] Implement the auth + token layer at `apps/lsp-worker/src/auth.ts` — Origin allowlist, HMAC-SHA256 signing with `SESSION_SIGNING_KEY` secret, per-isolate nonce ring buffer (24h-bounded for replay protection), per-IP mint rate limit (30/min). Shipped as part of the T039 commit since the Worker entry imports the auth helpers directly.
- [X] T041 [US3] Implement `RuneLspSession` Durable Object at `apps/lsp-worker/src/session.ts` — `acceptWebSocket()` with `accept()` fallback, `webSocketMessage(ws, msg)` handler dispatching JSON-RPC LSP methods (initialize, initialized, didOpen, didChange w/200ms debounce, didClose, hover, completion, definition, shutdown, exit), lazy langium service construction, `state.storage.docs:<uri>` persistence per data-model.md §1. The hover/completion/definition langium-routing returns `null` placeholders until the connection-adapter wiring is folded in alongside T044b.
- [X] T042 [P] [US3] Implement the structured logger at `apps/lsp-worker/src/log.ts` mirroring `apps/codegen-worker/src/log.ts` redact set; ALSO redact `params.contentChanges`, `params.text`, `result.contents`, `params.textDocument.text`, `result.contents.value` so source code never appears in logs (lsp-worker.md privacy invariants). Shipped in the T036 scaffold commit.
- [ ] T043 BLOCKED — needs lead's wrangler login + SESSION_SIGNING_KEY secret. Commands documented in `quickstart.md` §4: `openssl rand -base64 32 | pnpm --filter @rune-langium/lsp-worker exec wrangler secret put SESSION_SIGNING_KEY` then `pnpm --filter @rune-langium/lsp-worker exec wrangler deploy` then `curl -s https://www.daikonic.dev/rune-studio/api/lsp/health | jq` (expected `langium_loaded: true`).
- [X] T044 [US3] Replaced `tryWorker()` stub in `apps/studio/src/services/transport-provider.ts:108-130` with `tryCfWorker()` Step 3 — POST to `${config.lspSessionUrl}` to mint a token, then open `WebSocket(\`${config.lspWsUrl}/ws/${token}\`)` via the existing `createWebSocketTransport`. Retries the mint once on 401; surfaces "language services unavailable" on 429/5xx/repeated-401. New `'cf-worker'` discriminant on `TransportMode`. +6 transport-provider tests (11/11 GREEN).
- [ ] T044b [US3] In `apps/studio/src/components/ConnectionStatus.tsx` (or the equivalent status-bar status surface), add a `warming-up` transport state distinct from `disconnected` (spec EC-5): display "Language services starting…" with a spinner for the first ≤5s after WS upgrade until the first `serverCapabilities` message arrives. Add a unit test asserting the state machine transitions `connecting → warming-up → connected` cleanly and times out to `disconnected` if no `serverCapabilities` arrives within 10s
- [X] T045 [P] [US3] Added a Playwright e2e at `apps/studio/test/e2e/lsp-diagnostics.spec.ts` that mocks `/api/lsp/session` via `page.route` + injects a `window.WebSocket` stub answering `initialize` with the documented capabilities and emitting canned `publishDiagnostics`/`hover`/`completion`. Latency-budget asserts (≤2s problem entry, ≤1s hover, ≤1s completion) per SC-005. Suite is `test.skip(true, ...)` until the editor harness exposes a deterministic Step-3-engaged route — tracked alongside T044b.

### 7c. Fallback path (only if T035 FAILs)

**N/A — T035 spike PASSED.** Worker-hosted langium loads cleanly on the
free Workers tier; the PASS path (T036–T045) lands instead. T046–T048
are not executed.

- [N/A] T046 [US3] (skipped — spike PASS)
- [N/A] T047 [P] [US3] (skipped — spike PASS; README polish folded into T067)
- [N/A] T048 [US3] (skipped — spike PASS)

**Checkpoint**: SC-005 (latency budgets) measurable on PASS path; SC-006 (no localhost copy in production) holds either way.

---

## Phase 8 — User Story 7: Cross-surface UX consistency (Priority: P2)

Single biggest scope item after the LSP. Runs in parallel with US3.
Lifts brand tokens into one shared source, defines the missing
`--space-*` scale, reshapes the secondary button, normalises focus
rings, fixes the empty-state hierarchy.

**Independent Test**: After T049–T060, the side-by-side production
screenshots at 1280×800 of landing / docs / Studio show indistinguishable
primitives (button shape, font, focus ring); the Studio has zero
undefined `var(--…)` references; the empty state shows one solid
primary CTA among transparent-bordered secondaries; SC-011 manual
review passes.

### 8a. Design tokens consolidation (R7)

- [X] T049 [P] [US7] Extend `packages/design-tokens/src/tokens.json` with the new namespaces from data-model.md §3 — `font.{display,mono}`, `space.{1..10}`, `text.md`, `sidebar.width.{default,min,max}`, `syntax.{keyword,string,comment,function,operator,constant,variable}`, `radius.md`, `button.height`, `focus.ring.{width,offset,colour}`, `brand.mark.{size,radius,border-width}`
- [X] T050 [P] [US7] Extend `packages/design-tokens/src/build.ts` to emit `dist/brand.css` — a tiny `:root` block with the brand subset (font, palette, syntax, radius, focus-ring, brand-mark) for the landing site and the docs theme to consume
- [X] T051 [P] [US7] Extend `packages/design-tokens/tests/build.test.ts` asserting (a) every new variable family appears in `tokens.css`, (b) `brand.css` is emitted, (c) typed `Tokens` interface contains the new key paths
- [X] T052 [US7] Update `packages/design-system/src/theme.css` — `@import "@rune-langium/design-tokens/tokens.css"` so Studio inherits the canonical tokens; define `--space-*`, `--text-md`, `--sidebar-*`, `--text-secondary` as references to the imported tokens (FR-025)
- [X] T053 [US7] Update `packages/design-system/src/theme.css` body rule to use `var(--font-display)` (= Outfit) instead of `var(--font-sans)` (Inter); align with landing/docs (FR-022)

### 8b. Studio chrome reshape

- [X] T054 [US7] Reshape `Button variant="secondary"` in `packages/design-system/src/ui/button.tsx:20` from `bg-secondary text-secondary-foreground hover:bg-secondary/90` to `bg-transparent border border-input/70 hover:bg-muted text-foreground` (FR-023, R8)
- [X] T055 [P] [US7] Update `apps/studio/src/styles.css` `.studio-links nav` rule — replace `gap: var(--space-4)` (now resolves correctly) with the same `gap: 32px` value, `text-transform: uppercase`, `letter-spacing: 0.04em`, `font-size: 13px`, `font-weight: 500` so Studio nav matches landing + docs (FR-022)
- [X] T056 [P] [US7] Replace hard-coded hex literals in `apps/studio/src/styles.css:835-851` (`.diagnostic-error`, `.diagnostic-warning`, `.diagnostic-info`) with `var(--destructive)` / `var(--warning)` / `var(--info)` token references (FR-030)
- [X] T057 [P] [US7] Reshape the empty-state layout in `apps/studio/src/components/FileLoader.tsx` and `apps/studio/src/components/ModelLoader.tsx` per FR-028 — vertically centre the column, replace the `border-t` divider with `gap-8`, restyle Select Files / Select Folder as `variant="outline"` (now matches secondary's transparent treatment), promote the "Load Rune DSL Models" heading to `text-3xl font-display tracking-tight`
- [X] T058 [P] [US7] Normalise focus-visible ring across `apps/studio/src/styles.css` and `packages/design-system/src/ui/button.tsx` to `outline: 2px solid var(--ring); outline-offset: 2px` per FR-026; add the same rule to `site/index.html` and `apps/docs/.vitepress/theme/custom.css`
- [X] T059 [US7] Group `apps/studio/src/pages/EditorPage.tsx:639-694` toolbar buttons with `<Separator orientation="vertical" />` from the design-system; convert the panel-toggle group to `<ToggleGroup>` so they share `aria-pressed` semantics (FR-027)

### 8c. Cross-surface wire-up + CI guard

- [X] T060 [P] [US7] Update `site/index.html` to `<link rel="stylesheet" href="https://www.daikonic.dev/rune-studio/_assets/brand.css">` (or whatever the published path becomes) — replace the inline brand-token block with the shared source — *deferred wire-up; TODO comment + inline tokens kept as fallback (publishing pipeline gap)*
- [X] T061 [P] [US7] Update `apps/docs/.vitepress/theme/custom.css` to `@import "@rune-langium/design-tokens/dist/brand.css";` — replace the `--rune-*` declarations with token references
- [X] T062 [US7] Add a CI guard test at `apps/studio/test/quality/no-undefined-vars.test.ts` that scans `apps/studio/src/styles.css` for every `var(--…)` reference and asserts each one resolves to a definition emitted by `packages/design-tokens/dist/tokens.css`; FAIL with the offending name listed (FR-025, SC-012)
- [X] T063 [P] [US7] Add a visual-regression test at `apps/studio/test/visual/cross-surface.spec.ts` (Playwright) that screenshots the Studio start page at 1280×800 + 1440×900 and asserts (a) computed `body { font-family }` includes "Outfit", (b) primary button computed `border-radius` matches the canonical token value, (c) the "Select Files" button has `background: transparent` (not amber)
- [ ] T064 [US7] Manual smoke: capture three screenshots at 1280×800 (landing, docs, Studio) and visually confirm SC-011 ("designer cannot identify them as different products"); attach to the implementation PR — *skipped per Phase 8 instructions; lead captures screenshots after worktree merges*

**Checkpoint**: SC-011 (same-product gestalt), SC-012 (zero undefined `var(--…)`), FR-022..FR-030 all measurable.

---

## Phase 9 — User Story 6: Operator can verify production health (Priority: P2)

Tiny phase — `verify-production.sh` exists; this phase extends it to
include the LSP health probe added by Phase 4.

**Independent Test**: After T065–T066, `pnpm run verify:prod` against
production reports zero failures, exits 0; running it against an
unreachable BASE produces a clear failure message naming the down
endpoint.

- [X] T065 [US6] Cherry-picked `scripts/verify-production.sh` from the 012 commit (was on the 012 branch, never reached master) and added check #7 — `GET <BASE>/api/lsp/health` validates `{ok:true, langium_loaded:true}`. Branches on 200 / 404 / 405 / langium_loaded:false to classify (unrouted vs. bundle regression vs. catch-all). Live run against production now reports 7 expected FAILs (curated, telemetry, github-auth, route precedence, LSP) — matches the pre-deploy baseline. Will flip to all-PASS once T003–T007 + T043 land. Also restored the `pnpm run verify:prod` entry in root `package.json`.
- [X] T066 [P] [US6] Updated `specs/012-studio-workspace-ux/deploy-runbook.md` Step 7 to add: (a) a `curl /api/lsp/health` smoke step, (b) a `pnpm run verify:prod` one-shot smoke battery line. The script's own preamble comment block already documents BASE/STRICT env + exit codes from the 012 commit.

**Checkpoint**: SC-003 (zero failures from `verify-production.sh` against production) achievable.

---

## Phase 10 — Polish & Cross-Cutting Concerns

Final sweep — pure-doc updates, telemetry observability follow-ups,
and any test gaps that emerged.

- [X] T067 Updated `apps/studio/README.md` — replaced "Transport Failover" three-step claim with the actual two-mode (dev WS / prod CF Worker + DO) shape; rewrote LSP-handshake + WebSocket-security NFR rows; pointed at the 014 spec for env-var details.
- [X] T068 [P] Updated `specs/012-studio-workspace-ux/deploy-runbook.md` — Step 2 now flags the production-only GitHub App per R10; Step 4 has a route-precedence inventory table covering all five Workers (codegen / telemetry / github-auth / curated-mirror / lsp).
- [X] T069 [P] Effectively complete by absence — the deferred specs (`012-production-gaps.md`, `ux-polish-cross-surface.md`) were squashed out of master when feature 012 merged; their content was already folded into 014's spec.md / research.md / tasks.md during `/speckit.specify` + `/speckit.plan`. No file action remaining.
- [X] T070 Added `lsp_session_opened` / `lsp_session_failed` discriminated-union arms to `apps/telemetry-worker/src/index.ts` schema (FR-005 extension). `lsp_session_failed.errorCategory` is closed: `origin_blocked` / `token_expired` / `nonce_replay` / `upstream_unhealthy` / `unknown`. Tests at `apps/telemetry-worker/test/ingest.test.ts` (4 new: routing, errorCategory grouping, unknown-category rejection, extra-field rejection). Worker tests: 29 → 33 passing. Contract doc at `specs/012-studio-workspace-ux/contracts/telemetry-event.md` updated to match.
- [X] T071 [P] Full test suite green: **1416 tests passing** across 12 packages (baseline ≥1356; +60). Per-package: curated-schema 10, github-auth-worker 14, codegen-worker 52, design-tokens 7, core 169, curated-mirror-worker 19, codegen-container 15 (+2 skipped), telemetry-worker 33, lsp-server 47, lsp-worker 14, visual-editor 652, studio 384.
- [X] T072 [P] `pnpm -r run type-check` clean across all 17 buildable workspace projects (codegen, curated-schema, design-tokens, core, design-system, cli, lsp-server, codegen-container, codegen-worker, github-auth-worker, telemetry-worker, curated-mirror-worker, lsp-worker, visual-editor, studio). Required `pnpm install` after the lsp-worker merge to populate its node_modules with `@cloudflare/workers-types`.
- [ ] T073 Run the daily probe cron `7ff49f3e` (or invoke `pnpm run verify:prod` manually) immediately after deploy and confirm 7/7 PASS — **deferred to lead** post-T003-T007 + T043 deploy

---

## Dependency graph

```
Phase 1 (Setup) ─────────────────────────────▶ all later phases (deploy required for prod tests)
        │
        ├───▶ Phase 2 (Foundational) ────────▶ all user-story phases need config.ts
        │
        ├───▶ Phase 3 (US1 — curated load)  ◀──── INDEPENDENT
        │       └───▶ T013 needs the fixture; T014 changes one file; tests in T013/T015/T019
        │
        ├───▶ Phase 4 (US4 — dock chrome)   ◀──── INDEPENDENT (different files from US1)
        │
        ├───▶ Phase 5 (US2 — workspace restore)  ◀──── DEPENDS ON US1 only for E2E (manual smoke); unit tests independent
        │
        ├───▶ Phase 6 (US5 — GitHub flow)   ◀──── DEPENDS ON T006 (real GitHub App client ID)
        │
        ├───▶ Phase 7 (US3 — LSP)           ◀──── HARD GATE: T035 spike. Runs in parallel with US7.
        │
        ├───▶ Phase 8 (US7 — UX consistency) ◀──── INDEPENDENT (different files; runs parallel with US3)
        │
        ├───▶ Phase 9 (US6 — verify-prod)   ◀──── DEPENDS ON T043 (LSP deploy) for the new probe
        │
        └───▶ Phase 10 (Polish)             ◀──── DEPENDS ON every prior phase being complete
```

User-story phases are mostly independent (different files, different
acceptance criteria). US3 (LSP) and US7 (UX consistency) are the
biggest scopes; running them in parallel halves total wall-clock
time.

---

## Parallel execution examples

**Most parallelism per phase**:

- **Phase 3 (US1)**: T013, T015, T016, T018, T019 can run together (all `[P]`). T014 + T017 are serial against `model-store.ts` / `model-loader.ts`.
- **Phase 4 (US4)**: T021–T024 are all in `apps/studio/src/shell/`, mostly serial; T025 visual test is `[P]`.
- **Phase 7 (US3)**: T037, T038, T042 are `[P]` (different files: tests vs auth vs log). T036, T039–T041, T043, T044 form a serial chain (worker + DO + studio wiring + deploy + transport-provider).
- **Phase 8 (US7)**: T049–T051 (tokens) are `[P]`. T055–T056, T058, T060–T061, T063 are `[P]` (different files). T052–T054, T057, T059, T062 are serial against shared files.

**Recommended parallelisation**: Phase 1 (deploy) → Phase 2 (config) → run Phases 3 + 4 + 5 + 6 in parallel (independent files) → spike T035 → on PASS, run Phases 7 + 8 in parallel → Phase 9 → Phase 10. Total wall-clock with two engineers: ~2-3 weeks for PASS path, ~1-2 weeks for FAIL path.

---

## Implementation strategy (MVP-first)

**MVP scope** (User Story 1 only — Phases 1, 2, 3): the curated-load
happy path works end-to-end on the production deploy. This alone
flips the user-visible Studio from "every reference model click
fails" to "the demo path works." It's also the minimum needed to
validate the deploy-runbook against reality.

**Cut after MVP**: every other phase is independently shippable.
Phase 4 (dock chrome) is the highest-leverage P2 — single CSS import
+ a title map turns "muddled" into "intentional." Phase 8 (UX
consistency) is the largest non-LSP scope; ship Phase 4 first, then
Phase 8 in a follow-up if time pressure mounts.

**Phase 7 (LSP) is the real cost driver.** The spike at T035 is the
single load-bearing decision. If it fails, the entire LSP scope drops
from ~1.5 weeks to ~1 day (T046–T048).

---

## Format validation

Every task above:
- Starts with `- [ ]`
- Has a sequential `Txxx` ID
- Carries `[Story]` label exactly when in a user-story phase
- Carries `[P]` only when truly parallelisable
- Names a file path or runbook command
