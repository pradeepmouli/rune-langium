# Research: Studio Production Readiness

**Feature**: `014-studio-prod-ready`
**Phase**: 0 (Outline & Research)
**Date**: 2026-04-25

This document resolves every NEEDS CLARIFICATION from the
plan's Technical Context and records the decisions that shape
Phase 1 (data model + contracts + quickstart).

---

## R1 — LSP host architecture

**Decision**: Host the langium LSP server in `apps/lsp-worker`, a new
Cloudflare Worker that upgrades incoming WebSockets and forwards them
to a `RuneLspSession` Durable Object. The DO holds langium services
+ open-document state in memory and uses `acceptWebSocket()` to
hibernate when idle.

**Rationale**:
- A CF Worker isolate is V8 + Web-Platform shaped (same `URL`,
  `crypto.subtle`, `fetch`, `WebSocket`, `EventTarget` as a browser
  Worker). The Node-only modules that block langium from booting in
  a *browser* Worker (`node:events`, `node:crypto`) are available in
  CF Workers when `nodejs_compat` is enabled. The repo's other
  Workers already enable it (e.g.
  `apps/curated-mirror-worker/wrangler.toml:11`).
- Hosting the LSP server-side moves the parsing CPU off the user's
  laptop. CDM cold parse is ~1–2s; subsequent diagnostics are
  sub-100ms. On a paid plan (30s CPU per request), this is well
  inside budget.
- The studio's existing WebSocket transport
  (`apps/studio/src/services/ws-transport.ts`) is reused verbatim;
  only the URL changes. `transport-provider.ts` Step 3 swaps the
  no-op stub for a real `wss://` connection to the CF endpoint.
- DO hibernation (`acceptWebSocket()` API) keeps idle sessions
  cheap.

**Alternatives considered**:
- *Build a real in-browser LSP*: vendor langium with browser shims
  for `node:events` / `node:crypto`, bundle as a Vite worker
  chunk. Multi-week project; user's laptop bears the parse cost;
  no clear win over the CF approach. **Rejected**.
- *Accept "read-only Studio in production"*: rewrite the README +
  spec + status-bar copy to admit that production has no language
  services. Documentation-only, ~1 day. Acceptable as a fallback
  if R1 spike fails (see R2). **Rejected as primary path** because
  a Studio without diagnostics undercuts the entire 012 feature.

**Risk + mitigation**: the CF approach depends on langium's
transitive deps surviving the CF isolate. Mitigated by R2 spike
(below) running BEFORE any worker code is built.

---

## R2 — Pre-build feasibility spike

**Decision**: A 1-day spike runs at the start of Phase 4. The spike
is a scratch CF Worker (`scratch/lsp-spike/`) that imports
`@rune-langium/lsp-server`, parses the vendored
`apps/studio/test/fixtures/curated/tiny.tar.gz` extracted contents in
a `wrangler dev` instance, and emits a single
`textDocument/publishDiagnostics` over WebSocket back to a test
client. PASS condition: the diagnostics arrive with the same
content as the in-process test for the same fixture.

**Rationale**: Two pieces of risk dominate the C3 path —
(a) langium booting at all under the CF isolate, and
(b) the dependency tree needing browser shims that aren't
auto-resolved by `nodejs_compat`. A throwaway spike isolates both.

**Alternatives considered**:
- *Skip the spike and just build the worker*: high reversal cost if
  langium's dep tree pulls in `fs.readFile` or similar. **Rejected**.
- *Use miniflare unit tests*: doesn't catch deploy-only failures
  (CSP, route binding, real WS upgrade). The spike runs against
  `wrangler dev`. **Mitigation included** — spike result is a
  deploy-shaped artefact, not just a unit test.

**Failure path**: if the spike fails, drop to the deferred-spec
fallback — rewrite README + status-bar copy + spec, ship Studio as
syntax-highlighting only. Add a banner / docstring on the editor
panel explaining the limitation. Estimated 1 working day.

---

## R3 — Worker route precedence

**Decision**: Tighten `apps/codegen-worker/wrangler.toml` to bind only
`/rune-studio/api/codegen/*` (today it captures `/rune-studio/api/*`,
which is why every `POST /api/telemetry/v1/event` returns the
codegen-worker's catch-all 405). Each new Worker (`telemetry`,
`github-auth`, `curated-mirror`, `lsp`) keeps its narrow path.

**Rationale**: CF Workers route precedence is by route specificity.
A narrower pattern wins over a broader one only if the broader one
*doesn't* match — but `/rune-studio/api/*` matches everything, so it
takes any request the more specific Workers haven't bound.
Verified live by the verification agent: `POST /api/random-nonexistent`
returns the same 405 as `POST /api/telemetry/v1/event`.

**Alternatives considered**:
- *Add CF Workers Routes priority numbers*: not part of CF's public
  routing API; not portable. **Rejected**.
- *Have codegen-worker forward to other workers*: adds latency +
  coupling for no reason. **Rejected**.

---

## R4 — Curated archive flow + `archiveLoader` wiring

**Decision**: `apps/studio/src/store/model-store.ts:85` passes
`archiveLoader: (s, opts) => loadCuratedModel({...})` to
`loadModel(...)`. The conditional in `model-loader.ts:60`
(`if (source.archiveUrl && archiveLoader)`) then routes to the
curated-archive path instead of falling through to
`isomorphic-git`. The legacy git path remains in source (FR-019
calls for retire-or-gate; default = retire on this feature).

**Rationale**: the archiveLoader bridge already exists in
`model-loader.ts` from feature 012; it's a one-line import + DI
fix. The legacy git-clone path is operationally fragile (the
verification agent observed `cors.isomorphic-git.org` 401-ing
during a single test session) and adds attack surface; retiring it
is the cleanest move.

**Alternatives considered**:
- *Keep the legacy path as a `developerMode`-gated fallback*:
  defensible but unnecessary; nobody uses it intentionally and
  it's been broken for the entire 012 release. **Rejected**.
- *Move `archiveLoader` into a non-DI'd default*: works for the
  curated case but makes `model-loader.ts` less reusable.
  **Rejected**.

---

## R5 — Workspace restore on reload (C4)

**Decision**: `apps/studio/src/App.tsx`'s mount-time logic checks
`listRecents()` from `apps/studio/src/workspace/persistence.ts`
BEFORE rendering the empty `<FileLoader>`. If a most-recent
workspace exists AND its OPFS root is reachable, it restores
that workspace; otherwise it shows the start page with the recents
list rendered above the curated-models panel.

**Rationale**: `listRecents()` and the persistence layer already
exist (added in 012 Phase 4). The bug is that App.tsx's empty-state
check is `loadedModels.length === 0 → show empty state` without
ever consulting the recents store. Single-file fix.

**Alternatives considered**:
- *Auto-restore behind a "Continue where you left off" toast*:
  better UX but adds a UI surface that doesn't exist yet.
  **Deferred** to a future feature.

---

## R6 — GitHub Device-Flow start-page affordance (C5)

**Decision**: Add a button in `apps/studio/src/components/FileLoader.tsx`
labelled "Open from GitHub…" that opens the existing
`GitHubConnectDialog` (already implemented in 012 Phase 4 but not
mounted from a clickable affordance). On dialog success, the dialog
calls `cloneRepository()` from `git-backing.ts` and creates a new
workspace via `WorkspaceManager.create()`.

**Rationale**: the github-auth Worker, the device-flow client, and
the git-backing service all exist on master. The only missing piece
is the start-page button + the dialog wiring. This deliberately
keeps Phase 3 small — no new auth surface, no new clone logic.

**Alternatives considered**:
- *Build a "Recent GitHub repos" panel on the start page*: scope
  creep. **Deferred**.

---

## R7 — Cross-surface design-token consolidation (Phase 6)

**Decision**:
1. Promote `@rune-langium/design-tokens` to a single source of truth
   for fonts, syntax-color palette, surface hex, focus-ring spec,
   and the spacing scale. Add `--space-1`…`--space-10`, `--text-md`,
   `--sidebar-width` family, `syntax.*` namespace, and a
   `--font-display` (= `Outfit`) to `tokens.json`.
2. The build emits a tiny `dist/brand.css` that the landing's
   `<head>` `<link>`s and the VitePress theme `import`s.
3. The design-system's `theme.css` consumes the same tokens via
   `@import` so Studio inherits the same palette.
4. The existing in-Studio CSS rules referencing
   `var(--space-*)` / `var(--text-md)` / `var(--sidebar-width)`
   start working immediately because the tokens get defined.

**Rationale**: the post-merge audit found that brand values are
duplicated in three files (landing inline, docs `--rune-*`, Studio
`--background`/`--primary`) and they happen to match by hand-copy,
not by reference. A future re-skin requires touching three places.
The single-source-of-truth approach also closes FR-025 (defined
custom properties) and FR-026 (focus-ring uniformity) for free.

**Alternatives considered**:
- *Keep three copies and add a CI guard that asserts them
  identical*: brittle; first divergence breaks CI for unrelated
  reasons. **Rejected**.
- *Inline a subset of tokens in the landing's HTML* (avoid a
  fetch on first paint): could ship later as an optimisation; the
  initial token tree fits in <2KB gzipped, the
  fetch is amortised. **Acceptable.**

---

## R8 — `Button variant="secondary"` reshape (FR-023)

**Decision**: Update `packages/design-system/src/ui/button.tsx`'s
`secondary` CVA variant from
`bg-secondary text-secondary-foreground hover:bg-secondary/90`
to `bg-transparent border border-input/70 hover:bg-muted text-foreground`.
The amber `--secondary` token stays in the design system (used for
the choice-category surface) but no longer drives chrome buttons.

**Rationale**: matches landing's `.btn-secondary` pattern. Avoids
the empty-state-CTAs-shouting-louder-than-primary problem the audit
flagged. Backwards compatible everywhere `Button variant="secondary"`
is used because the call site already expects "subordinate to
primary."

**Alternatives considered**:
- *Add a new `Button variant="ghost-bordered"` and migrate
  call sites*: more disruptive, adds API surface. **Rejected**
  unless we discover existing `secondary` usage that *needs* the
  amber treatment (none found in the audit).

---

## R9 — `verify-production.sh` extension for LSP

**Decision**: After Phase 4 lands, extend
`scripts/verify-production.sh` with one new check:
`POST /rune-studio/api/lsp/health` (a tiny health route on the LSP
worker that does *not* upgrade WS, just returns
`{ok: true, langium_loaded: bool}`). The existing curated /
telemetry / github-auth checks remain unchanged.

**Rationale**: a real WS-upgrade test is awkward in pure curl; a
health route is the standard CF pattern. The bool flag exposes
whether the LSP worker actually loaded langium at runtime —
catches the "deployed but Vite-rolled-up the wrong files" failure
mode the verification agent flagged for the studio bundle.

**Alternatives considered**:
- *Use `websocat` or a Node script*: adds an env dep to the
  script. **Rejected** — keep the script POSIX shell + curl only.

---

## R10 — GitHub App identity for production

**Decision**: A *separate* production-only GitHub App is
registered with the production callback URL
(`https://www.daikonic.dev/rune-studio/api/github-auth/poll`). The
dev GitHub App stays at `localhost` for `pnpm dev`. The production
App's client ID replaces the placeholder in
`apps/github-auth-worker/wrangler.toml`.

**Rationale**: GitHub Device Flow's `verification_uri` is shared,
but the `client_id` differs per app, so a single registration
can't serve both prod and local-dev callback URLs. Cleanly split
prevents dev installations from leaking into the prod token
exchange.

**Alternatives considered**:
- *Use a single GitHub App with multiple callback URLs*: GitHub
  Apps support this, but the rate-limit/usage telemetry conflates
  dev + prod traffic. **Rejected**.

---

## Open questions resolved

All Technical Context items resolved by R1–R10. No remaining
NEEDS CLARIFICATION markers.

| Spec clarify candidate | Resolution |
|---|---|
| LSP transport architecture | R1 + R2: server-hosted on CF Worker + DO, gated by 1-day spike |
| Whether GitHub Device-Flow ships in this feature | R6: yes (US5 stays P3 in scope, single-file UI add) |
| `cors.isomorphic-git.org` retirement | R4: retire (FR-019 default) |
| Canonical primary-button shape | Decided: 8px radius / 40px height / weight 600 (audit's recommendation) |
| Canonical body font | Decided: `Outfit` for body (matches landing + docs); Studio's `Inter` use is dropped |
| GitHub App identity | R10: production-only app |
