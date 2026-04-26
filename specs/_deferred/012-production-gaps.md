# Deferred Feature Scope: Make 012 Actually Work in Production

**Status**: Deferred — not yet a feature branch.
**Origin**: Production verification of feature `012-studio-workspace-ux`
performed on 2026-04-25 by a research agent driving Playwright + curl
against `https://www.daikonic.dev/rune-studio/studio/` and the three
Worker routes. **Six distinct broken systems** were observed; the 012
bundle ships, but virtually none of its supporting infrastructure was
deployed AND there is at least one call-site wiring bug in the source.

When ready, hand the **Intent Summary** below to `/speckit.specify`.

Artefacts: 12 PNGs at `verify-012/01..12-*.png`.

---

## Intent Summary

**Feature**: Close every gap between the 012 bundle that's already
shipping at `www.daikonic.dev/rune-studio/studio/` and the
functionality the spec promised. Make the curated-corpus download,
the dock shell chrome, the workspace persistence, the telemetry
ingest, and the GitHub-auth surface actually work end-to-end against
the production deploy.

**Problem being solved**:
The 012 PR is *technically merged* but *operationally non-functional*.
Verification observed:

1. **All three curated models fail to load.** Clicking CDM, FpML, or
   rune-DSL surfaces an `archive_decode` or `network` error after
   30–90s. Network capture shows zero requests to
   `www.daikonic.dev/curated/...` — the Studio falls through to the
   legacy `isomorphic-git` clone path against
   `cors.isomorphic-git.org` (which then itself fails for unrelated
   reasons). The curated-mirror Worker is unrouted (every
   `/curated/*` returns `404` with empty body) AND the
   `archiveLoader` is never passed at the call site, so even after
   deploying the Worker the runtime would still pick the wrong path.

2. **The dockable IDE shell renders without chrome.** The page DOM
   has 93 `.dv-*` elements but the bundled CSS contains zero `.dv-*`
   selectors (`grep -c 'dv-tab' index-ug8RyMpu.css` → `0`). Panel
   labels render as raw text in the page flow:
   `workspace.fileTree`, `workspace.editor`, `workspace.problems`,
   etc. No tab strip, no sash handles, no group separators.

3. **Workspace persistence is not engaged.** Reload after creating a
   "New blank workspace" returns the user to the empty start page —
   no recents, no workspace switcher UI, no restore. `indexedDB.databases()`
   returns only the legacy `rune-model-cache` from feature 008.

4. **The LSP transport fallback is a documented stub.** The
   `transport-provider.ts:108-130` "fallback to embedded Worker"
   path is hard-coded to log a warning and return a no-op
   transport. The README's three-step fallback chain is partially
   fictional; in production the editor has no language services
   and the status bar permanently reads "LSP server unavailable —
   start the external server on ws://localhost:3001" — which is
   developer-only copy.

5. **Telemetry, GitHub-auth, and curated-mirror Workers are
   unrouted.** Every `POST /rune-studio/api/*` returns `405` from a
   catch-all (proven: a `POST /api/random-nonexistent` returns the
   same `405`). Every `GET /curated/*` returns `404` with no body.
   None of the three new Workers are bound to their routes.

6. **GitHub Device-Flow auth UI is not in the bundle.** The bundle
   does not reference `github-auth/device-init`. There is no
   "Open from GitHub" affordance on the live start page even
   though Phase 4 of the spec implements it.

**Chosen approach**:

Split the work into **operational** (do once, then write down so we
don't forget) and **code** (regressions / wiring bugs). Both must
land before SC-007's "same product" claim or any of the
`curated_load_*` telemetry counters can mean anything.

Operational:
1. Execute `specs/012-studio-workspace-ux/deploy-runbook.md`
   Steps 1, 4, 5 (R2 bucket, three Worker deploys, first cron run).
2. Configure the GitHub App for production (Step 2 of the runbook)
   so `device-init` returns a real `device_code`.

Code (this is the spec proper):
1. Wire `archiveLoader: loadCuratedModel` through `model-store.ts`'s
   `loadModel()` call so the curated-archive path actually runs.
2. Import `dockview-react/dist/styles/dockview.css` from the Studio
   entry (already in `ux-polish-cross-surface.md` as C3; if that
   spec lands first, drop this from here).
3. Either build the embedded-Worker LSP fallback or change the
   spec, the README, and the status-bar copy to reflect that
   production has no language services.
4. Add a "Open from GitHub repo" affordance on the start page that
   triggers the Device-Flow path.
5. Verify and fix the OPFS workspace-restore flow on reload.

**Success criteria**:
- [ ] Clicking the CDM curated card produces a network request to
      `www.daikonic.dev/curated/cdm/manifest.json` (200), then
      `latest.tar.gz` (200), then OPFS writes, then a loaded model
      in under 60s on a 50 Mbps connection (SC-001).
- [ ] FpML and rune-DSL clicks behave identically against their
      manifests.
- [ ] `curl https://www.daikonic.dev/rune-studio/api/telemetry/v1/event`
      with a valid POST body returns `204`. The same with an
      unknown field returns `400 schema_violation`.
- [ ] `curl https://www.daikonic.dev/rune-studio/api/github-auth/device-init`
      (POST, allowed Origin) returns `200` with a `device_code` /
      `user_code`.
- [ ] At 1280×800 and 1440×900, the dock shell shows visible tab
      strips, sash handles, and panel separators. Tab labels read
      `Files`, `Editor`, `Problems`, `Output`, `Preview`, `Inspector`
      (not the registry IDs).
- [ ] Reload after creating any workspace restores the user to the
      same workspace with the same active tabs (SC-004 ≥95%).
- [ ] The Studio status bar copy never references
      `ws://localhost:3001` for non-developer users.
- [ ] After a successful curated load, the production telemetry DO
      reflects the `curated_load_success` counter (verifiable via
      `GET /v1/stats?event=curated_load_success&date=YYYY-MM-DD`
      behind CF Access).

**Out of scope (explicit)**:
- The full UX-polish work in `specs/_deferred/ux-polish-cross-surface.md`
  (font, button shape, secondary-button color, `--space-*`
  definitions). The dockview CSS-import overlap is the only item
  shared between the two specs.
- Building a browser-compatible `@lspeasy/core` from scratch. If
  the embedded LSP worker path is to ship, scope that as its own
  feature.
- Migrating the Studio host (Cloudflare Pages → anything else).
- Performance work beyond ensuring the curated-load happy path
  meets SC-001 / SC-002.

**Open questions for the spec**:
- For LSP gap (#3): the architecture is settled (CF Worker + DO,
  see C3 below). The remaining decision is whether to run the
  1-day spike *before* `/speckit.plan` (recommended — bounds
  the C3 task at "build the worker" vs "rewrite the spec for
  read-only Studio") or *during* the implementation phase.
- Should `archiveLoader` be wired in `model-store.ts` (the call
  site that exists today) or in a new "model-loading service"
  that abstracts both paths? The verification agent traced today's
  call to `apps/studio/src/store/model-store.ts:85`, with no
  `archiveLoader` argument. The minimal fix is to pass
  `archiveLoader: (s, opts) => loadCuratedModel({ ...opts, ... })`
  there.
- Does production need to deploy the **same** GitHub App as dev,
  or a separate production-only app? `apps/github-auth-worker/wrangler.toml`
  has the placeholder `Iv1.PLACEHOLDER_REPLACE_BEFORE_DEPLOY`.
  Decide before the runbook executes.

---

## Findings — drop-in checklist

References use `file:line`. Severity matches operational impact —
"Blocker" means SC-001 / SC-009 / SC-010 cannot be measured at all
without it.

### Blocker (everything else depends on these)

- [x] **B1a — R2 bucket `rune-curated-mirror` exists.**
  - Verified 2026-04-25 via `wrangler r2 bucket info`: created
    `2026-04-25T04:03:19.483Z`, location `ENAM`, **0 objects**.
  - The bucket is in place. Step 1 of the runbook is done.

- [ ] **B1b — Deploy the three Workers + seed R2 (runbook Steps 4, 5).**
  - `wrangler deploy` for `apps/curated-mirror-worker`,
    `apps/github-auth-worker`, `apps/telemetry-worker` (Step 4).
  - `wrangler dev --test-scheduled` then
    `curl /__scheduled?cron=0+3+*+*+*` to seed R2 with the first
    nightly fetch — this populates manifests + archives the
    curated-mirror Worker is supposed to serve. The bucket
    object_count is currently `0`, so the cron has not run.
  - Verify after: `curl https://www.daikonic.dev/curated/cdm/manifest.json`
    returns `200` with valid JSON, not `404`. Then re-run
    `wrangler r2 bucket info rune-curated-mirror` and expect
    `object_count` ≥ 1 per modelId.
  - Operational only — no code changes.

- [ ] **B2 — Wire `archiveLoader` through `loadModel`.**
  - File: `apps/studio/src/store/model-store.ts:85`.
  - Today: `await loadModel(source, { signal, onProgress, ... })`
    with no `archiveLoader`. The conditional in
    `apps/studio/src/services/model-loader.ts:60` reads
    `if (source.archiveUrl && archiveLoader) { ... }` — `archiveLoader`
    is undefined, so the code falls through to the legacy git path.
  - Fix: import `loadCuratedModel` from
    `../services/curated-loader.js` and pass an `archiveLoader`
    that calls it with the right OPFS root + telemetry client +
    abort signal:
    ```ts
    archiveLoader: (s, opts) =>
      loadCuratedModel({
        modelId: s.id as CuratedModelId,
        mirrorBase: 'https://www.daikonic.dev/curated',
        fs: opfs,
        writeRoot: `/${currentWorkspaceId}/files/${s.id}`,
        telemetry,
        signal: opts.signal,
        onProgress: (path, size) => opts.onProgress?.({ ... })
      })
    ```
  - Verify: with the network panel open, clicking the CDM curated
    card should make exactly two requests to `www.daikonic.dev/curated/cdm/...`
    (manifest.json then latest.tar.gz), no `cors.isomorphic-git.org`
    requests at all.

- [ ] **B3 — Import `dockview-react` stylesheet.**
  - File: `apps/studio/src/main.tsx` (or a top-level `import` in
    `apps/studio/src/styles.css`).
  - Add: `import 'dockview-react/dist/styles/dockview.css';` (or
    the `dockview-react/dist/css/...` path the package actually
    exports — verify against the package's `package.json`
    `"exports"` map).
  - Pick **one** dockview theme: the live DOM currently has *both*
    `dockview-theme-light` and `dockview-theme-abyss` set on the
    same element. Audit and remove the redundant application
    (likely in `apps/studio/src/shell/DockShell.tsx` — search for
    both class names).
  - Verify: at 1440×900, panel tab strips are visible; sash
    handles are draggable; the labels `workspace.*` no longer
    appear as raw text.

### Critical (fixed before the next preview deploy)

- [ ] **C1 — User-facing panel titles instead of registry IDs.**
  - File: `apps/studio/src/shell/layout-factory.ts` — add a
    `PANEL_TITLES: Record<PanelComponentName, string>` map
    (`Files`, `Editor`, `Problems`, `Output`, `Preview`,
    `Inspector`).
  - File: `apps/studio/src/shell/dockview-bridge.ts:108-141` —
    pass `title: PANEL_TITLES[c0.component]` etc. on every
    `addPanel({ ... })` call.
  - This is a duplicate of `ux-polish-cross-surface.md:I2` — drop
    one of the two when the parent spec consolidates.

- [ ] **C2 — Status-bar copy decoupled from developer instructions.**
  - File: `apps/studio/src/services/transport-provider.ts:120` —
    today the error message string is hard-coded as
    `"LSP server unavailable — start the external server on ws://localhost:3001"`.
    Production users see this verbatim.
  - Fix: gate the developer instruction on
    `import.meta.env.DEV` (or a `studioConfig.developerMode` flag).
    Production string: `"Editor running offline — language services unavailable."`
    Dev string: keep today's text.
  - This is a cosmetic patch over a real gap (see C3) but **must
    ship regardless** because it's leaking dev URLs to public users.

- [ ] **C3 — Host the LSP server in a Cloudflare Worker + Durable Object.**
  - File today: `apps/studio/src/services/transport-provider.ts:108-130`.
    `tryWorker()` is a documented stub: *"The in-browser LSP server
    requires @lspeasy/core which depends on Node.js-only modules
    (node:events, node:crypto). Until a browser-compatible LSP core
    is available, we cannot embed the server in a Worker."* This
    contradicts both `apps/studio/README.md`'s three-step fallback
    claim AND the spec's implicit "Studio is functional in
    production" assumption.
  - **Approach**: replace the in-browser embedded-Worker leg with a
    server-hosted LSP on Cloudflare. A new `apps/lsp-worker` Worker
    accepts a WebSocket upgrade at
    `wss://www.daikonic.dev/rune-studio/api/lsp/ws/<sessionId>` and
    forwards to a `RuneLspSession` Durable Object that holds the
    WebSocket plus the langium services + open-document state in
    memory. WS hibernation (`acceptWebSocket()`) keeps idle sessions
    cheap; per-session DO routing isolates state per tab.

    ```
    Studio (browser)                www.daikonic.dev
        │                                │
        │ WebSocket /api/lsp/ws/<wsId>   │
        ├───────────────────────────────▶│  apps/lsp-worker (route)
        │                                ▼
        │                       ┌───────────────────────┐
        │                       │  RuneLspSession DO    │
        │                       │  - holds the WS       │
        │                       │  - holds langium      │
        │                       │    services + open    │
        │                       │    docs in memory     │
        │                       │  - acceptWebSocket()  │
        │                       │    → hibernates idle  │
        │                       └───────────────────────┘
    ```

    Why this works where the in-browser path didn't:
      - CF Worker isolates have the platform shape (V8, fetch,
        crypto.subtle, WebSocket) that langium needs, AND
        `nodejs_compat` is already enabled in this repo's other
        Workers — `node:events` / `node:crypto` resolve.
      - Langium's parsing + validation cost runs on CF infra, not
        the user's laptop. Heavy CDM parses don't burn battery.
      - The studio's existing WebSocket transport
        (`apps/studio/src/services/ws-transport.ts`) is reused
        verbatim; only the URL changes from `ws://localhost:3001`
        to the production CF endpoint.

    Tasks:
    1. **Spike (1 day) — confirm langium boots in a CF Worker.**
       New scratch worker that imports `@rune-langium/lsp-server`
       and parses a fixture file in a `wrangler dev` instance.
       Risk surface is non-langium transitives; langium itself is
       browser-friendly.
    2. **Build `apps/lsp-worker`** (~1 week) — Worker entry +
       `RuneLspSession` DO + WS upgrade + LSP message routing.
       Mirror the patterns in `apps/codegen-worker` (Worker +
       routing) and `apps/telemetry-worker` (DO with state).
    3. **Wire `apps/studio/src/services/transport-provider.ts:108`**
       to connect to the CF endpoint as the documented Step 3 of
       the fallback chain. Drop the no-op transport.
    4. **Auth at the WS upgrade** — same Origin allowlist pattern
       as the other Workers, plus a session token to bound DO spawn
       (re-use the github-auth token if present, otherwise a
       per-tab nonce minted by an unauthenticated `/lsp/session`
       endpoint).
    5. **Update `apps/studio/README.md`** — rewrite the transport
       section to reflect Step 3 = CF Worker, not in-browser
       SharedWorker.

  - **Cost / capacity caveats** (worth deciding before
    `/speckit.plan`):
    - Paid CF plan required (30s CPU per request; free plan's
      50ms is not enough for cold parse).
    - Each `didChange` is a billable WS event. Rough order
      $1–3/month/active editor; revisit if usage scales.
    - 128 MB DO memory per session; CDM parsed AST fits, but
      verify in the spike.

  - **Fallback if the spike fails**: drop to "accept read-only
    Studio in production" — rewrite the README + spec to describe
    Studio as syntax-highlighting only, change the status-bar copy
    permanently, ship a banner. ~1 day. The spike's pass/fail
    determines which path; don't proceed past `/speckit.plan`
    without it.

- [ ] **C4 — Workspace persistence: actually save + restore.**
  - The verification agent observed: reload after "New blank
    workspace" returns the user to the start page; no recents,
    no switcher UI.
  - Suspected root cause: the `WorkspaceManager`'s save-on-mutate
    path is wired but the start-page boot logic isn't checking
    `listRecents()` before rendering the empty state.
  - File entry points to investigate:
    - `apps/studio/src/App.tsx` — the early return that renders
      `<FileLoader>` should check for recents first.
    - `apps/studio/src/components/WorkspaceSwitcher.tsx` —
      verify it's mounted somewhere (a `grep` on the production
      bundle did NOT find any "switcher" / "recents" string in
      the visible UI).
    - `apps/studio/src/workspace/persistence.ts` — confirm
      `saveWorkspace()` is called from each mutation that should
      checkpoint state.
  - Verify: after "New blank workspace" → reload, the start
    page lists the workspace under "Recent" and clicking it
    restores the dock layout + open tabs. Per SC-004, this must
    work ≥95% of the time on the same browser/device.

- [ ] **C5 — Add a "Open from GitHub repo" affordance.**
  - The bundle does not reference `github-auth/device-init`. The
    spec's Phase 4 implementation lives in
    `apps/studio/src/services/github-auth.ts` but no UI invokes
    it.
  - File: `apps/studio/src/components/FileLoader.tsx` (or the
    start-page row alongside "Select Files" / "Select Folder") —
    add a "Open GitHub repository…" button.
  - On click: render a dialog that takes a repo URL, calls
    `startDeviceFlow()`, displays the `user_code` + verification
    URL, polls `device-poll` until success, then clones into OPFS
    via `git-backing.ts`.
  - This depends on B1 (the github-auth Worker actually exists)
    and on the C5 dialog component being built.

### Important (fixed before SC-009 telemetry can be trusted)

- [ ] **I1 — Verify telemetry events actually reach the DO post-deploy.**
  - Once B1 is done, drive the studio against a real curated-load
    flow and confirm that `GET /v1/stats?event=curated_load_success`
    increments. If it does not, trace from
    `apps/studio/src/services/telemetry.ts` → the worker's
    schema validation → DO `inc` route.
  - Suspect: schema-violation responses (400s) returned to the
    studio are silently swallowed by `telemetry.ts`'s
    `try { fetch(...) } catch {}` block (intentional fail-silent
    per FR-T03). Add a `console.warn` in dev mode so schema
    drift is noticed locally.

- [ ] **I2 — Add a `ws://` host to `studioConfig` so dev can override.**
  - The dev-only ws://localhost:3001 string is hard-coded in
    `transport-provider.ts:90` (verify exact line). Move to
    `import.meta.env.VITE_LSP_WS_URL` with a sensible default,
    so a developer running a remote LSP can point to their host.

- [ ] **I3 — Worker route catch-all returns 405 for everything.**
  - The verification agent observed identical `405 content-length: 0`
    responses for every `/api/*` POST, including
    `/api/random-nonexistent`. This means there's already a
    Worker bound to a parent route that's eating the requests
    before the new Workers can reach them. Likely the existing
    `apps/codegen-worker` is bound on `www.daikonic.dev/api/*`
    or `www.daikonic.dev/rune-studio/api/*` and is only handling
    its own paths.
  - Fix: confirm the route patterns in each worker's
    `wrangler.toml` are *narrower* than codegen-worker's. The new
    workers should bind to specific paths
    (`/rune-studio/api/telemetry/*`, `/rune-studio/api/github-auth/*`,
    `/curated/*`) and the codegen worker should keep its existing
    `/rune-studio/api/codegen/*` only.
  - Verify post-deploy: `POST /rune-studio/api/telemetry/v1/event`
    must hit the **telemetry** worker's response shape, not the
    codegen catch-all's `405`.

### Polish (track as follow-ups)

- [ ] **P1 — `cors.isomorphic-git.org` reliance for the legacy path.**
  - Once B2 lands, the legacy git-clone path becomes a fallback
    only. Inventory all remaining callers and decide whether to
    keep the public CORS proxy or drop it entirely. The
    verification agent observed it 401'd repeatedly during the
    test session — relying on a public proxy in production is
    operationally fragile.

- [ ] **P2 — Add a Playwright e2e that drives a real curated-load.**
  - File: new `apps/studio/test/e2e/curated-load.spec.ts`.
  - Mock `/curated/cdm/manifest.json` and `latest.tar.gz` with
    Playwright's `route.fulfill`, click the CDM card, assert the
    OPFS write completes within 5s and the model surfaces in the
    editor.
  - Today the only e2e is the a11y axe-core run; we have zero
    coverage of the SC-001 happy path against a real browser.

- [ ] **P3 — Add a "verify production" CLI / script.**
  - `scripts/verify-production.sh` (or a `pnpm run verify:prod`
    target) that runs the curl battery from the verification
    report. Catches the "Workers not deployed" class of bug in
    seconds the next time someone re-runs the deploy.

---

## Carried context

- The `7ff49f3e` cron set on 2026-04-25 is already polling the
  three production endpoints daily. As soon as B1 lands it will
  begin reporting "Deploy looks good" and run the smoke battery
  from the runbook automatically.
- PR #105 (012-studio-workspace-ux) currently has 1 outstanding
  CI failure — the studio-a11y axe-core run fails on a real
  hidden file-input violation that was already fixed in commit
  `00d6dc8`. Once that re-runs green, the merge gate is open.
  Even so, **PR #105 should NOT merge until at least B1 + B2 +
  B3 are landed**, because the bundle currently shipping to
  production from master is materially broken.

---

## Pre-spec checklist

When picking this up:

1. Run `/speckit.clarify` first against this doc — the three
   open questions (LSP path, archiveLoader call site, GitHub
   App identity) need decisions before `/speckit.plan` can
   produce a sane build order.
2. Re-run the verification Playwright script against the
   production deploy (after Step 1 of the runbook lands) to
   confirm the curated mirror is actually serving manifests.
3. Decide whether to fold the dockview-CSS import (B3 here, C3
   in `ux-polish-cross-surface.md`) into one spec or keep it in
   the polish spec. Recommendation: keep in this spec since
   it's blocking, drop from polish.
4. Confirm with deploy-rights holder that the wrangler/CF
   account credentials are available for the runbook. Steps 1,
   4, 5 of the runbook need a human with `wrangler whoami`
   pointing at the right account (`8327a4da4660eab7d78695268282da09`).
