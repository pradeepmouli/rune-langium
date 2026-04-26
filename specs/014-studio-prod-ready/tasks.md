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

- [ ] T013 [P] [US1] Write failing e2e test at `apps/studio/test/e2e/curated-load.spec.ts` (Playwright) that uses `route.fulfill` to mock `/curated/cdm/manifest.json` + `/curated/cdm/latest.tar.gz` against the vendored `tiny.tar.gz` fixture; asserts (a) only daikonic.dev URLs are fetched, (b) workspace becomes interactive within 5s of mock-completion, (c) at least one `.rosetta` file is open in the editor (FR-020)
- [ ] T014 [US1] Wire `archiveLoader: (s, opts) => loadCuratedModel({...})` into the `loadModel(...)` call at `apps/studio/src/store/model-store.ts:85` per research.md R4 + B2; pass through the OPFS root from the active workspace, the telemetry client, signal, onProgress
- [ ] T015 [P] [US1] Update unit tests in `apps/studio/test/store/model-store.test.ts` (or add if absent) asserting the `loadCuratedModel` path runs when `source.archiveUrl` is set; the legacy git path is NOT invoked
- [ ] T016 [P] [US1] Add a Playwright route-block in `curated-load.spec.ts` for any `cors.isomorphic-git.org/**` request that fails the test if hit (regression guard for FR-019)
- [ ] T017 [US1] Gate the legacy `cors.isomorphic-git.org` clone path in `apps/studio/src/services/model-loader.ts` behind `config.legacyGitPathEnabled` (FR-019); production builds set it to `false` so the path is unreachable from the public deploy
- [ ] T018 [P] [US1] Update `apps/studio/src/components/CuratedLoadErrorPanel.tsx` if needed to surface every `ErrorCategory` value (network, archive_not_found, archive_decode, storage_quota, permission_denied, cancelled, unknown) with a distinct user-actionable message (FR-002 verification)
- [ ] T019 [P] [US1] Run `pnpm --filter @rune-langium/studio exec playwright test test/e2e/curated-load.spec.ts` against the local dev server; confirm GREEN
- [ ] T019b [P] [US1] Add a Playwright e2e at `apps/studio/test/e2e/curated-load-cancel.spec.ts` covering the cancel-mid-flight edge case (spec EC-2): initiate a curated load against the mocked fixture, call `signal.abort()` after the manifest fetch but before the archive completes, reload the page, and assert (a) the partial workspace folder under OPFS is gone or flagged `pending: true`, (b) the start page shows no orphaned recents entry, (c) `listRecents()` does not include the cancelled workspace
- [ ] T020 [US1] Manual smoke: open production Studio in a fresh browser profile, click CDM, verify the network panel matches the spec (2 daikonic.dev fetches, 0 isomorphic-git proxy calls); attach screenshots to the implementation PR

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

- [ ] T027 [P] [US2] Write failing test at `apps/studio/test/components/App-restore.test.tsx` covering: (a) fresh profile → start page renders, (b) one workspace recently used → workspace restored at mount, (c) recent workspace exists but its OPFS handle is gone → fall back to start page with the recents list rendered (so user can pick a different one)
- [ ] T028 [US2] Modify `apps/studio/src/App.tsx` mount-time logic to call `listRecents()` from `apps/studio/src/workspace/persistence.ts` BEFORE rendering `<FileLoader>`; if a most-recent workspace exists AND its OPFS root is reachable, restore via `WorkspaceManager.open(record.id)`; otherwise show start page with recents listed (R5)
- [ ] T029 [P] [US2] Mount `<WorkspaceSwitcher>` (already exists in `apps/studio/src/components/WorkspaceSwitcher.tsx`) on the start page above the curated-models row; surfaces recents with their kind and `lastOpenedAt` for FR-011
- [ ] T030 [US2] Manual smoke: load a workspace, modify a file, reload; verify the workspace restores within 5s (Chrome DevTools Performance tab); attach a perf trace to the implementation PR for the SC-002 baseline

**Checkpoint**: SC-002 (5s restore), SC-008 (90% day-2 recovery — measurable post-deploy via telemetry counters).

---

## Phase 6 — User Story 5: Open from GitHub start-page affordance (Priority: P3)

The `GitHubConnectDialog` and `git-backing` services already exist;
this phase wires the start-page button.

**Independent Test**: After T031–T034, click "Open from GitHub" on
the empty start page; complete a Device Flow against a public repo;
within 30s the repo's `.rosetta` files appear in the file tree.

- [ ] T031 [P] [US5] Add an "Open from GitHub" button to `apps/studio/src/components/FileLoader.tsx`'s start-page row (alongside Select Files / Select Folder); on click, opens `<GitHubConnectDialog>` (already in `apps/studio/src/components/GitHubConnectDialog.tsx`)
- [ ] T032 [US5] Wire the dialog's success callback to `WorkspaceManager.createGitBacked({ repoUrl, branch, token })` so the cloned repo becomes a new workspace and is opened immediately (C5)
- [ ] T032b [P] [US5] In `apps/studio/src/components/GitHubConnectDialog.tsx`, branch on the device-init response status (spec EC-6): `502 github_misconfigured` → show "GitHub authorisation is not yet available — please come back later"; `503 github_unavailable` → show "GitHub appears to be down — please retry shortly"; `403 origin_not_allowed` → show "Studio configuration error — contact support". Add a component test at `apps/studio/test/components/GitHubConnect-error-paths.test.tsx` covering each branch
- [ ] T033 [P] [US5] Write a component test at `apps/studio/test/components/GitHubConnect-flow.test.tsx` covering the happy path: dialog open → device-init mocked → user-code displayed → poll mocked to return access_token → dialog closes → workspace created
- [ ] T034 [US5] Add a Playwright e2e at `apps/studio/test/e2e/github-flow.spec.ts` that mocks the github-auth Worker's `device-init` and `device-poll` responses and asserts the dialog flows from open → user-code → token → workspace creation in under 30s

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

- [ ] T035 [US3] Build a scratch CF Worker at `scratch/lsp-spike/` that imports `@rune-langium/lsp-server` and parses the vendored CDM fixture in a `wrangler dev` instance; emit one `textDocument/publishDiagnostics` over WebSocket back to a test client; PASS = diagnostics arrive matching the in-process test for the same fixture (research.md R2)

**Spike PASS path** continues at T036. **Spike FAIL path** jumps to T046.

### 7b. Build the LSP Worker (only if T035 PASSes)

- [ ] T036 [US3] Scaffold `apps/lsp-worker/` with `package.json` (deps: `@cloudflare/workers-types`, `wrangler@4`, `@rune-langium/lsp-server`, `@rune-langium/curated-schema`, `pino`), `wrangler.toml` (route `/rune-studio/api/lsp/*`, DO binding `LSP_SESSION`, `nodejs_compat` flag, paid-plan worker), `tsconfig.json`, and a `vitest.config.ts` mirroring `apps/telemetry-worker`'s setup
- [ ] T037 [P] [US3] Write failing tests at `apps/lsp-worker/test/upgrade.test.ts` covering the WS-upgrade contract per `contracts/lsp-worker.md`: (a) valid token + valid origin → 101, (b) invalid signature → 401 invalid_session, (c) expired token → 401, (d) wrong origin → 403, (e) replayed nonce → 409, (f) non-WS request → 426
- [ ] T038 [P] [US3] Write failing tests at `apps/lsp-worker/test/session.test.ts` covering the DO message-routing contract: (a) `initialize` returns the documented serverCapabilities, (b) `didOpen` adds to `state.storage.docs:<uri>`, (c) `didChange` debounces 200ms then re-parses, (d) `didClose` removes from storage, (e) `shutdown` clears storage, (f) malformed JSON-RPC → returns `methodNotFound` per JSON-RPC 2.0
- [ ] T039 [US3] Implement the Worker entry at `apps/lsp-worker/src/index.ts` — routes `POST /session` (mints HMAC-signed token), `GET /health` (returns `{ok, langium_loaded, uptime}`), `WS /ws/<token>` (validates token, upgrades, forwards to DO)
- [ ] T040 [US3] Implement the auth + token layer at `apps/lsp-worker/src/auth.ts` — Origin allowlist, HMAC-SHA256 signing with `SESSION_SIGNING_KEY` secret, per-isolate nonce ring buffer (24h-bounded for replay protection)
- [ ] T041 [US3] Implement `RuneLspSession` Durable Object at `apps/lsp-worker/src/session.ts` — `acceptWebSocket()`, `webSocketMessage(ws, msg)` handler dispatching JSON-RPC LSP methods, lazy langium service construction, `state.storage.docs:<uri>` persistence per data-model.md §1
- [ ] T042 [P] [US3] Implement the structured logger at `apps/lsp-worker/src/log.ts` mirroring `apps/codegen-worker/src/log.ts` redact set; ALSO redact `params.contentChanges`, `params.text`, `result.contents` so source code never appears in logs (lsp-worker.md privacy invariants)
- [ ] T043 [US3] Set the `SESSION_SIGNING_KEY` secret via `pnpm --filter @rune-langium/lsp-worker exec wrangler secret put SESSION_SIGNING_KEY`; deploy with `wrangler deploy`; manually verify `GET /api/lsp/health` returns 200 with `langium_loaded: true`
- [ ] T044 [US3] Replace `tryWorker()` stub in `apps/studio/src/services/transport-provider.ts:108-130` with a real Step 3 — POST to `${config.lspSessionUrl}` to mint a token, then open `WebSocket(\`${config.lspWsUrl}/ws/${token}\`)`; on success return a real Transport; on 401 mint a fresh token and retry once
- [ ] T044b [US3] In `apps/studio/src/components/ConnectionStatus.tsx` (or the equivalent status-bar status surface), add a `warming-up` transport state distinct from `disconnected` (spec EC-5): display "Language services starting…" with a spinner for the first ≤5s after WS upgrade until the first `serverCapabilities` message arrives. Add a unit test asserting the state machine transitions `connecting → warming-up → connected` cleanly and times out to `disconnected` if no `serverCapabilities` arrives within 10s
- [ ] T045 [P] [US3] Add a Playwright e2e at `apps/studio/test/e2e/lsp-diagnostics.spec.ts` that drives the editor against production: type a typo, assert a Problems-panel entry within 2s; hover a known type, assert tooltip within 1s; trigger Ctrl-Space, assert completion list within 1s (SC-005)

### 7c. Fallback path (only if T035 FAILs)

- [ ] T046 [US3] Rewrite `apps/studio/src/services/transport-provider.ts:108-130` — keep the no-op transport but rename it `tryDocumentedFallback()`; remove the `ws://localhost:3001` reference from production paths; under `config.devMode === true` keep the dev message
- [ ] T047 [P] [US3] Rewrite `apps/studio/README.md`'s "Transport Failover" section — replace the three-step claim with the truth: "Studio is read-only in production; live language services require a local LSP server (developers only)"
- [ ] T048 [US3] Add a non-modal banner above the editor pane that surfaces "Live language services are not yet available in the deployed Studio. The editor is syntax-highlighting only" with a Dismiss button

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

- [ ] T049 [P] [US7] Extend `packages/design-tokens/src/tokens.json` with the new namespaces from data-model.md §3 — `font.{display,mono}`, `space.{1..10}`, `text.md`, `sidebar.width.{default,min,max}`, `syntax.{keyword,string,comment,function,operator,constant,variable}`, `radius.md`, `button.height`, `focus.ring.{width,offset,colour}`, `brand.mark.{size,radius,border-width}`
- [ ] T050 [P] [US7] Extend `packages/design-tokens/src/build.ts` to emit `dist/brand.css` — a tiny `:root` block with the brand subset (font, palette, syntax, radius, focus-ring, brand-mark) for the landing site and the docs theme to consume
- [ ] T051 [P] [US7] Extend `packages/design-tokens/tests/build.test.ts` asserting (a) every new variable family appears in `tokens.css`, (b) `brand.css` is emitted, (c) typed `Tokens` interface contains the new key paths
- [ ] T052 [US7] Update `packages/design-system/src/theme.css` — `@import "@rune-langium/design-tokens/tokens.css"` so Studio inherits the canonical tokens; define `--space-*`, `--text-md`, `--sidebar-*`, `--text-secondary` as references to the imported tokens (FR-025)
- [ ] T053 [US7] Update `packages/design-system/src/theme.css` body rule to use `var(--font-display)` (= Outfit) instead of `var(--font-sans)` (Inter); align with landing/docs (FR-022)

### 8b. Studio chrome reshape

- [ ] T054 [US7] Reshape `Button variant="secondary"` in `packages/design-system/src/ui/button.tsx:20` from `bg-secondary text-secondary-foreground hover:bg-secondary/90` to `bg-transparent border border-input/70 hover:bg-muted text-foreground` (FR-023, R8)
- [ ] T055 [P] [US7] Update `apps/studio/src/styles.css` `.studio-links nav` rule — replace `gap: var(--space-4)` (now resolves correctly) with the same `gap: 32px` value, `text-transform: uppercase`, `letter-spacing: 0.04em`, `font-size: 13px`, `font-weight: 500` so Studio nav matches landing + docs (FR-022)
- [ ] T056 [P] [US7] Replace hard-coded hex literals in `apps/studio/src/styles.css:835-851` (`.diagnostic-error`, `.diagnostic-warning`, `.diagnostic-info`) with `var(--destructive)` / `var(--warning)` / `var(--info)` token references (FR-030)
- [ ] T057 [P] [US7] Reshape the empty-state layout in `apps/studio/src/components/FileLoader.tsx` and `apps/studio/src/components/ModelLoader.tsx` per FR-028 — vertically centre the column, replace the `border-t` divider with `gap-8`, restyle Select Files / Select Folder as `variant="outline"` (now matches secondary's transparent treatment), promote the "Load Rune DSL Models" heading to `text-3xl font-display tracking-tight`
- [ ] T058 [P] [US7] Normalise focus-visible ring across `apps/studio/src/styles.css` and `packages/design-system/src/ui/button.tsx` to `outline: 2px solid var(--ring); outline-offset: 2px` per FR-026; add the same rule to `site/index.html` and `apps/docs/.vitepress/theme/custom.css`
- [ ] T059 [US7] Group `apps/studio/src/pages/EditorPage.tsx:639-694` toolbar buttons with `<Separator orientation="vertical" />` from the design-system; convert the panel-toggle group to `<ToggleGroup>` so they share `aria-pressed` semantics (FR-027)

### 8c. Cross-surface wire-up + CI guard

- [ ] T060 [P] [US7] Update `site/index.html` to `<link rel="stylesheet" href="https://www.daikonic.dev/rune-studio/_assets/brand.css">` (or whatever the published path becomes) — replace the inline brand-token block with the shared source
- [ ] T061 [P] [US7] Update `apps/docs/.vitepress/theme/custom.css` to `@import "@rune-langium/design-tokens/dist/brand.css";` — replace the `--rune-*` declarations with token references
- [ ] T062 [US7] Add a CI guard test at `apps/studio/test/quality/no-undefined-vars.test.ts` that scans `apps/studio/src/styles.css` for every `var(--…)` reference and asserts each one resolves to a definition emitted by `packages/design-tokens/dist/tokens.css`; FAIL with the offending name listed (FR-025, SC-012)
- [ ] T063 [P] [US7] Add a visual-regression test at `apps/studio/test/visual/cross-surface.spec.ts` (Playwright) that screenshots the Studio start page at 1280×800 + 1440×900 and asserts (a) computed `body { font-family }` includes "Outfit", (b) primary button computed `border-radius` matches the canonical token value, (c) the "Select Files" button has `background: transparent` (not amber)
- [ ] T064 [US7] Manual smoke: capture three screenshots at 1280×800 (landing, docs, Studio) and visually confirm SC-011 ("designer cannot identify them as different products"); attach to the implementation PR

**Checkpoint**: SC-011 (same-product gestalt), SC-012 (zero undefined `var(--…)`), FR-022..FR-030 all measurable.

---

## Phase 9 — User Story 6: Operator can verify production health (Priority: P2)

Tiny phase — `verify-production.sh` exists; this phase extends it to
include the LSP health probe added by Phase 4.

**Independent Test**: After T065–T066, `pnpm run verify:prod` against
production reports zero failures, exits 0; running it against an
unreachable BASE produces a clear failure message naming the down
endpoint.

- [ ] T065 [US6] Extend `scripts/verify-production.sh` with check #7 from `contracts/verify-production.md` — `GET <BASE>/api/lsp/health` expected `{ok: true, langium_loaded: true}`; classify failures (404 = unrouted, `langium_loaded: false` = bundle regression). Conditional: this task only lands AFTER T043 deploys the LSP worker; if the LSP fallback path landed instead (T046), this check returns "skipped" with a note about read-only Studio.
- [ ] T066 [P] [US6] Update the README of `scripts/verify-production.sh`'s comment block + a one-line bullet in the post-deploy runbook (`specs/012-studio-workspace-ux/deploy-runbook.md` Step 7) to mention the new probe

**Checkpoint**: SC-003 (zero failures from `verify-production.sh` against production) achievable.

---

## Phase 10 — Polish & Cross-Cutting Concerns

Final sweep — pure-doc updates, telemetry observability follow-ups,
and any test gaps that emerged.

- [ ] T067 Update `apps/studio/README.md` "Transport Failover" section to match the actual behaviour shipping (PASS path: CF Worker + DO; FAIL path: read-only Studio). Single source of truth.
- [ ] T068 [P] Update `specs/012-studio-workspace-ux/deploy-runbook.md` to reflect the route precedence fix (T001) and the GitHub App identity decision (R10 / T006); link 014's spec for the operational followup
- [ ] T069 [P] Mark `specs/_deferred/012-production-gaps.md` and `specs/_deferred/ux-polish-cross-surface.md` as superseded by 014; add a one-line pointer at the top of each to `specs/014-studio-prod-ready/`
- [ ] T070 Add a `lsp_session_opened` / `lsp_session_failed` discriminated-union arm to `apps/telemetry-worker/src/index.ts` schema with the field set from `contracts/lsp-worker.md` (FR-005 extension); add tests covering accept (`204`) and rejection of unknown errorCategory values (`400`)
- [ ] T071 [P] Run the full test suite (`pnpm -r test`) and confirm baseline of ≥1356 passing tests is preserved; any new test counts get added to a one-line summary at the top of the implementation PR description
- [ ] T072 [P] Run `pnpm -r run type-check` and confirm clean across the workspace
- [ ] T073 Run the daily probe cron `7ff49f3e` (or invoke `pnpm run verify:prod` manually) immediately after deploy and confirm 7/7 PASS

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
