# Production UX Checkout Harness — Design Spec

**Date:** 2026-07-16
**Status:** Proposed
**Target:** the deployed Studio at `https://www.daikonic.dev/rune-studio/studio/` ("daikonic")
**Companion:** `.agents/skills/prod-ux-review/SKILL.md` — the agent skill that reviews a harness run.

## 1. Goal

A single command that exercises **every user-facing capability** of the deployed
Studio end-to-end — all five perspectives, every center-stack tab, the full
edit/persist/export loop, curated-model hydration, import/export, and the
supporting Workers — and emits a **machine-readable evidence bundle**
(screenshots, traces, console/network logs, timings, a11y results, per-journey
verdicts) that a review agent can audit without re-running anything.

This is a superset of the existing `prod-smoke` suite. Smoke answers "is prod
alive and current?"; **checkout** answers "does every feature still work, look
right, and feel right in prod?"

### Non-goals

- Pixel-perfect visual regression against golden screenshots (prod corpus and
  content drift too fast; screenshots are *captured for review*, not asserted).
- Load/stress testing.
- Exercising authenticated GitHub push-back (no credentials in prod runs; we
  verify the dialogs/flows *up to* the auth boundary).
- Replacing local e2e (`apps/studio/test/e2e/**`) — those stay the fast,
  deterministic regression net; this harness validates the *deployed
  composition* (real Workers, real curated corpus, real CDN).

## 2. Existing assets and how they're reused

| Asset | Role in this design |
|---|---|
| `apps/studio/test/prod-smoke/production-checkout.spec.ts` | Absorbed as journeys J0/J3/J4; its `loadCdm` helper is promoted to a shared fixture. |
| `apps/studio/playwright.prod.config.ts` | Extended with a second `testMatch` entry (`prod-ux/**`) and artifact settings; smoke stays runnable alone. |
| `scripts/verify-production.sh` | Runs first as J0b (API/Worker probes). Its PASS/FAIL lines are parsed into the run manifest. |
| Local e2e specs (`test/e2e/*.spec.ts`) | Source of selectors and flow shapes — prod journeys reuse the same `data-testid` anchors so a selector rename breaks both and gets caught locally first. |

## 3. Hard constraints (safety rails)

1. **Non-destructive by construction.** All mutation is confined to
   browser-local state (OPFS workspace files, IndexedDB metadata/layouts) inside
   the ephemeral Playwright profile — discarded at teardown. The only server
   endpoints invoked are read/compute (`/api/parse`, `/api/codegen`, curated
   manifest/artifact GETs). Never authenticate GitHub; never invoke telemetry
   POSTs beyond what the app does organically.
2. **Corpus-stable anchors only.** Type anchors must survive curated rebuilds
   (lesson: `BusinessCenterEnum` migrated to the codelist pattern 2026-07-02).
   All anchors live in one `anchors.ts` module with a comment per anchor stating
   why it is stable; an anchor failing existence-check marks the journey
   `BLOCKED(corpus-drift)`, not `FAIL`.
3. **No `networkidle`.** The studio keeps worker/LSP connections open; wait on
   visible UI readiness (`data-testid` visibility), per repo convention.
4. **Serial, single worker, generous timeouts** (prod cold paths: CDM curated
   load allows 90s; hydration 30s). `retries: 1` with `trace: 'on-first-retry'`
   so a flake yields a trace instead of a red run.
5. **Known-issue ledger, not skips.** Known-degraded features (e.g. the topbar
   Export Code modal's `/api/codegen` 503 history) run as `soft` assertions
   tagged with the ledger entry ID; they report `DEGRADED(known)` instead of
   failing the run. Ledger: `apps/studio/test/prod-ux/known-issues.json`.
6. **Gated:** `PLAYWRIGHT_PROD_SMOKE=1` (reuse the existing env gate) — the
   suite must never run in ordinary CI test jobs.

## 4. Architecture

```
apps/studio/test/prod-ux/
  anchors.ts               # corpus-stable type/namespace anchors + stability notes
  known-issues.json        # ledger: [{id, journey, assertion, reason, issueUrl, expires}]
  fixtures.ts              # checkout fixture: page + evidence collector + loadCdm/loadBlank helpers
  evidence.ts              # EvidenceCollector: console, pageerror, request-failure,
                           #   per-checkpoint screenshot+timing, manifest writer
  journeys/
    j00-freshness.spec.ts  ... j18-type-closure.spec.ts   # one file per journey (below)
  report/                  # gitignored output: run-manifest.json, screenshots/, axe/
```

### The `checkout` fixture

Wraps `test` with an `EvidenceCollector` that:

- subscribes to `console` (severity ≥ warning), `pageerror`, `requestfailed`,
  and non-2xx/3xx responses to first-party hosts (`daikonic.dev`, workers);
- exposes `await checkpoint(name)` — full-page screenshot into
  `report/screenshots/<journey>/<seq>-<name>.png`, wall-clock timing entry, and
  (when enabled) an axe scan snapshot;
- exposes `soft(ledgerId, assertion)` for known-issue assertions;
- on teardown writes a per-journey record into `report/run-manifest.json`.

### Run manifest contract (the seam with the review skill)

```jsonc
{
  "runId": "prod-ux-2026-07-16T12-00-00Z",
  "baseUrl": "https://www.daikonic.dev/rune-studio/studio/",
  "deploy": { "liveCommit": "…", "masterCommit": "…", "current": true },
  "verifyProduction": { "pass": 14, "fail": 0, "warn": 1, "lines": ["…"] },
  "journeys": [{
    "id": "J06", "title": "Structure view", "verdict": "PASS",   // PASS | DEGRADED | FAIL | BLOCKED
    "durationMs": 41200,
    "checkpoints": [{ "name": "flow-rendered", "screenshot": "…", "tMs": 3100 }],
    "consoleErrors": [], "failedRequests": [],
    "softFindings": [{ "ledgerId": "KI-003", "detail": "…" }],
    "axe": { "critical": 0, "serious": 0, "reportPath": "…" }
  }],
  // Wall-clock operation timings — one entry per user-meaningful operation,
  // each with its soft budget so the review agent can flag drift without
  // hard-failing the run. Repeatable ops (hydration, codegen, import) record
  // one entry per subject.
  "timings": [
    { "op": "startPageInteractive",  "subject": null,                 "ms": 0, "budgetMs": 5000  },
    { "op": "workspaceOpen",         "subject": "starter.rosetta",    "ms": 0, "budgetMs": 5000  },
    { "op": "cdmLoad",               "subject": "CDM",                "ms": 0, "budgetMs": 45000 },
    { "op": "hydration",             "subject": "<namespace>",        "ms": 0, "budgetMs": 10000 },
    { "op": "typeClosureWalk",       "subject": "<data type fqn>",    "ms": 0, "budgetMs": 60000 },
    { "op": "formRender",            "subject": "<data type fqn>",    "ms": 0, "budgetMs": 5000  },
    { "op": "functionExecute",       "subject": "<func fqn>",         "ms": 0, "budgetMs": 10000 },
    { "op": "codegen",               "subject": "<target>",           "ms": 0, "budgetMs": 15000 },
    { "op": "importPreview",         "subject": "<format>",           "ms": 0, "budgetMs": 10000 },
    { "op": "importMerge",           "subject": "<format>",           "ms": 0, "budgetMs": 10000 },
    { "op": "reloadRestore",         "subject": null,                 "ms": 0, "budgetMs": 8000  }
  ],
  "typeClosure": [{                       // J18 output — see journey inventory
    "root": "<data type fqn>", "source": "curated|scratch",
    "visited": 0, "mapped": 0, "unmapped": ["<fqn>…"], "hydrationsTriggered": 0
  }]
}
```

Budgets are **soft** (recorded, reviewed, trend-compared); only the journey's
hard timeouts fail a run. Exceeding budget marks the journey `DEGRADED`.

Verdict semantics: **PASS** (all hard assertions green), **DEGRADED** (only
soft/known-issue findings), **FAIL** (hard assertion failed), **BLOCKED**
(prerequisite missing — anchor drift, upstream journey failed, env not set).

## 5. Journey inventory

Ordered so later journeys can assume earlier state where noted; each journey is
otherwise self-contained (fresh page, own workspace) so one failure doesn't
cascade. `⚓` = uses `anchors.ts`.

### J0 — Deployment freshness & platform probes
- **J0a** Canonical CF Pages deployment == `origin/master` (existing test, absorbed). Requires `CLOUDFLARE_API_TOKEN`/`ACCOUNT_ID`; otherwise `BLOCKED(env)` — never silently green.
- **J0b** `scripts/verify-production.sh` (curl probes for the site + Workers, curated manifest reachable); parsed into manifest.

### J1 — First run / start page
Fresh profile → `./`: title `Rune Studio`, `model-loader` visible, no
`UnsupportedViewport`, zero console errors on settle, curated catalog cards
render (CDM button present ⚓). Checkpoints: `start-page`.

### J2 — Workspace lifecycle & persistence
Create workspace via `.rosetta` upload (`starter.rosetta`) → `explore-workbench`
appears → rail back to `workspaces` → workspace listed → **reload page** →
workspace still listed and reopenable (OPFS/IndexedDB persistence) → unload/
delete → gone. Checkpoints: `workspace-created`, `after-reload`.

### J3 — Curated CDM load & unload
`loadCdm` (existing helper): "Loaded Models" + `Unload CDM…` button within 90s;
then unload → model-loader returns, explorer content cleared. Timing recorded
as `cdmLoadMs`.

### J4 — Explorer navigation & on-demand hydration
With CDM: namespace search filters the virtualized tree; navigate enum ⚓ and
data ⚓ anchors; navigate a **never-hydrated** namespace ⚓ (Counterparty) —
Inspector members populate (`Members ([1-9]…)`); with a delayed `/api/parse`
route, the `rune-node-hydrating-spinner` shows then clears. (Existing tests
absorbed.) Also: hydration failure path — abort one `/api/parse` and assert the
error surfaces as a toast/`CuratedLoadErrorPanel`, not a silent empty pane.

### J5 — Inspector pane
Heading, namespace line, `Reference Only` badge for curated types ⚓, member
list with types/cardinalities, clicking a member's type reference navigates.

### J6 — Structure view (React Flow)
`structure-view-flow` renders, no `structure-empty-state`; select a node —
inspector/selection sync; expand/collapse; graph filter menu opens and filters;
pan/zoom does not error; edges render for an extends-anchor ⚓.

### J7 — Source view + LSP
Open workspace file in Source tab: CodeMirror renders content; **embedded
browser LSP worker** connects (LspConnectionBadge reaches connected state);
introduce a syntax error → diagnostic appears in editor + Problems panel;
revert → diagnostic clears.

### J8 — Edit round-trip (workspace file only, never curated)
In the scratch workspace: create a type, add an attribute, set cardinality via
CardinalityPicker, rename the type (edge cascade), undo ×2 / redo ×2, dirty
indicator toggles, save → **reload** → edits persisted via OPFS. Source tab
reflects the edits (source-graph sync).

### J9 — Form preview & function execution
**One of each — curated ⚓ and scratch-authored** for both subjects. Data
types: select a curated data type ⚓ AND the scratch type from J8 →
FormPreviewPanel renders the generated form for each; enter an invalid value →
schema validation message; valid value → accepted. Functions: execute one
curated corpus function ⚓ AND one function authored in the scratch workspace;
output viewer shows a result for each. Curated-side failures classify as
corpus-drift candidates; scratch-side failures are unambiguous regressions —
running both is what disambiguates. `formRender`/`functionExecute` timings
recorded per subject.

### J10 — Expression language lens
On an expression-bearing member (scratch workspace to keep it deterministic):
toggle Rune → TypeScript → Python → back; content round-trips (no drift, no
`RawDsl` pending-reparse residue), no console errors.

### J11 — Client-side codegen (Code tab)
For the scratch workspace and one curated anchor ⚓: Code tab renders non-empty
output per target (TypeScript, Zod, JSON Schema, OpenAPI, SQL); download event
fires for the Excel/download path (this is the **client-side** Code tab path,
distinct from the topbar Export Code modal — see KI ledger).

### J12 — Import dialog (inbound codegen)
Open Import; for each format — JSON Schema, OpenAPI, SQL (tree-sitter WASM —
guards PR #390's `?url` grammar fetch in the deployed bundle), XSD — load a tiny
inline fixture, preview shows parsed types, adjust one import option, merge →
imported types appear in explorer and are navigable. One format failing must
not poison the dialog for the next (state resets between formats).

### J13 — Export perspective
Export/Packaging renders; DownloadConfigDialog opens/edits/closes; workspace
bundle export produces a download (validated: non-zero tar.gz, contains the
scratch `.rosetta`). Topbar Export Code modal → `/api/codegen`: **soft**
assertion under ledger `KI-codegen-503` (historically 503 in prod).

### J14 — Git / Sync perspective
Perspective renders (requires workspace); GitHubConnectDialog opens and closes
cleanly; SyncStatusBadge shows the unauthenticated state. **Stop at the auth
boundary.**

### J15 — Settings perspective
Theme toggle light↔dark (`data-theme` flips, checkpoint screenshots in both for
the review agent), font scale up/down applies, layout reset restores default
dockview arrangement; settings persist across reload.

### J16 — Resilience & chrome
Reload mid-Explore restores active perspective + dockview layout; curated load
**cancel** mid-flight returns cleanly to the loader (absorb
`curated-load-cancel` shape); rail buttons for workspace-requiring perspectives
disabled with no workspace; `resolveEffectivePerspective` fallback (delete last
file while in Explore → lands on Workspaces, header and body agree); toasts
appear and auto-dismiss.

### J17 — Accessibility sweep
Axe scan (`@axe-core/playwright`) at one representative checkpoint per
perspective + the Import and Export dialogs, both themes. Hard-fail on
`critical`; `serious` recorded for review. Full results into `report/axe/`.

### J18 — Data-type closure mapping (scripted completeness check)
For **one curated data type ⚓ and one scratch data type** (the J8 type,
extended with attributes referencing a nested type, an enum, and a choice):
walk the **transitive attribute-type closure** from the root — every attribute
whose type is a Data/Choice/Enum is followed, recursively, until only builtins
remain. At every step assert the referenced sub-type is **mapped**: it
resolves to a navigable node (explorer nav succeeds), its Inspector shows
populated members (hydration triggered on demand where needed), and the form
preview for the root renders no unknown-type stub for that field. Cycle-safe
(visited set), depth-capped only by the closure itself. Emits the
`typeClosure` manifest record: visited/mapped counts, the exact `unmapped`
fqn list, hydrations triggered, and the `typeClosureWalk` timing. Any
`unmapped` entry ⇒ journey FAIL (curated root: review agent double-checks for
corpus-drift before treating as regression).

This is the deterministic, scripted half of the mapping guarantee; the review
agent's screenshot audit (empty inspectors, `unknown` stubs in forms) is the
perceptual half.

**Cross-cutting (every journey):** zero unexpected console errors, zero failed
first-party requests, every checkpoint screenshot captured; and — once Phase 0
lands — every toast observed in the DOM during the journey has a matching
op-log entry in the drained ring buffer (the §6 superset-of-toasts invariant;
a toast with no log entry fails the journey). These feed the manifest even
when the journey's own assertions pass — the review agent judges noise trends.

## 6. Operation logging — Activity/Output panel + Cloudflare visibility

The harness's timings and the review agent's diagnosis both improve sharply if
the app itself emits structured operation logs. This section specs that
instrumentation (app-side work, FSL `apps/studio` + Workers; buildable as its
own small PR before or alongside harness Phase 1 — the harness degrades
gracefully to test-side stopwatches without it).

### `opLog` service (`apps/studio/src/services/op-log.ts`)

```ts
const span = opLog.start('cdmLoad', 'CDM');        // ops mirror the §4 timing table
span.end({ ok: true, detail: '238 namespaces' });   // → {ts, op, subject, durationMs, level, detail, opId}
```

Entries land in a capped ring buffer (zustand store, ~500 entries, level =
info|warn|error). Instrumented call sites: workspace open/save, curated
load/unload, per-namespace hydration (`/api/parse` round-trips), codegen per
target, import preview/merge, function execution, LSP transport
connect/reconnect, bundle export.

### Superset-of-toasts invariant

The op log is a strict **superset of everything that hits the toast layer**:
any event a user sees as a toast must also exist as an op-log entry (plus all
the operations that never toast). Enforced at the single existing seam — the
`StudioToastContext` methods (`showToast` / `showLoadingToast` /
`dismissToast` in `StudioToastProvider.tsx`) mirror into the ring buffer as
they fire, so no call-site sweep is needed and future toast call sites are
covered by construction:

| Toast call | Op-log mirror |
|---|---|
| `showToast(variant: 'default')` | `info` entry |
| `showToast(variant: 'destructive')` | `error` entry |
| `showLoadingToast(...)` → `dismissToast(id)` | span start → span end (duration = toast lifetime), matching hydration-style background ops |

Toasts stay ephemeral; the Activity panel is where a dismissed toast remains
findable. This is deliberately **one channel, two projections** — not a
parallel notification implementation: a later phase may invert the dependency
(op-log entries flagged `notify` *produce* toasts), but Phase 0 only adds the
provider-level mirror. The invariant is testable, and the harness asserts it:
every toast observed during a journey must have a matching `opLog` entry in
the manifest (see cross-cutting checks, §5).

### Sink 1 — Activity/Output view (Explore perspective)

The existing `ActivityPanel`/`OutputPanel` (`apps/studio/src/shell/panels/`)
subscribe to the ring buffer: Activity shows the live operation stream
(op, subject, duration, status icon); Output shows the selected entry's
detail/error payload. This is user-facing value independent of the harness —
"what is the studio doing right now / why was that slow" — and gives the
review agent human-legible history in screenshots.

### Sink 2 — Cloudflare

- **Client → CF:** batched, sampled ship of warn/error + slow-op entries to the
  existing telemetry worker (the `op_spans` batch event on the existing
  `POST /api/telemetry/v1/event` — see §7; gated by the existing telemetry
  opt-in; harness runs set the opt-in so their ops are visible).
- **Worker-side:** `/api/parse`, `/api/codegen`, and curated-mirror requests log
  the same `{op, subject, durationMs, opId}` shape via `console.log` → visible
  in Workers Logs / dashboards and queryable when diagnosing (per the
  check-CF-logs-first rule).
- **Correlation:** the client sends its `opId` as an `x-studio-op-id` request
  header; workers echo it in their log lines, so a browser-side hydration span
  joins to its server-side parse span across the two log streams.

### Sink 3 — the harness

The checkout fixture drains the ring buffer (via a window-exposed read hook)
at journey teardown and embeds it as `journeys[].opLog` in the run manifest;
where an op-log span exists for a §4 timing, the harness prefers it over its
own stopwatch (measures the real operation, not test overhead + operation).

## 7. Real-user behavior review (telemetry digests)

The harness reviews *synthetic* sessions. This section extends the same
machinery to **regular production use**, so an agent can review real users'
errors/warnings/timing issues without a new pipeline. The simplification
principle: **a user-session digest is a run-manifest journey record without
assertions** — same op vocabulary, same budgets, same known-issues ledger,
same review skill. Everything the review agent learned for harness runs
transfers unchanged.

### Capture (extends the §6 opLog, all behind the existing telemetry opt-in)

- `window.onerror` / `unhandledrejection` / a `console.error|warn` tap →
  op-log entries (level `error`/`warn`) with a grouping **signature**
  (top stack frame + op context), joining the ops already instrumented.
- Timing: the §4 op spans already carry durations; add a `PerformanceObserver`
  for long tasks and start-page vitals mapped onto the same op names
  (`startPageInteractive` etc.) so budgets are defined exactly once.
- Session envelope: anonymous `sessionId`, app commit, active perspective,
  op subjects. **Never model source content** — curated type fqns are fine,
  scratch-workspace text is not. TTL'd storage.

### Ship & aggregate — extend the EXISTING telemetry worker, no new API

`apps/telemetry-worker` already exists and already has the hard parts built:
`POST /rune-studio/api/telemetry/v1/event` (origin allowlist, CORS, 10/min/IP
rate limit, strict Zod discriminated union, daily-salt IP hashing — no raw IP
ever stored), a `TelemetryAggregator` Durable Object for per-event/per-day
counters, and an admin read side `GET /v1/stats` behind CF Access. It is
currently **deployed but unused by the studio client** — §6's CF sink is what
finally lights it up. Because it has no live producers/consumers, the v1
schema is evolved in place (no v2, no compat shims — no-migration-before-live).

Three additive changes:

1. **Ingest:** add one `op_spans` **batch** event to the existing
   discriminated union — an array of `{op, subject?, durationMs, level,
   signature?, opId}` entries per POST (batching is mandatory anyway under
   the 10 events/min/IP limit). The 8 existing bespoke events
   (`curated_load_*`, `workspace_open/restore_*`, `lsp_session_*`) are
   already op-spans in disguise (`curated_load_success` even carries
   `durationMs`) — their client call sites are replaced by op-log entries so
   there is exactly one client-side emission path; the worker keeps their
   counter semantics by deriving them from the matching `op` names.
2. **Aggregation:** extend `TelemetryAggregator` (or add a Workers Analytics
   Engine binding for distributions) with per-op duration histograms
   (p50/p95 vs `budgetMs`) and error/warn **signature** counts keyed by
   affected-session count, first/last-seen commit, `new-in-this-deploy` flag.
   Errors ship at 100%, warns sampled, info heavily sampled; `x-studio-op-id`
   joins client spans to Worker log lines as in §6.
3. **Read:** add `GET /v1/digest?since=<iso>` beside `/v1/stats`, behind the
   same CF Access admin gate, returning the daily fleet rollup (and sampled
   error-bearing session digests in run-manifest journey shape — `opLog`,
   `consoleErrors`, `failedRequests`, timings vs budget — minus
   verdicts/checkpoints/screenshots).

### Agent access — one call, existing rules

`GET …/v1/digest` (CF Access service token; wrapped as
`pnpm --filter @rune-langium/studio run telemetry:digest`) returns the rollup.
The `prod-ux-review` skill gains a **telemetry mode**: given a rollup instead
of a harness bundle, it skips the screenshot/assertion steps and applies the
same triage — 5-class classification per signature, ledger reconciliation,
budget/trend review, CF-log correlation via sampled opIds. Server-side
signature grouping is what keeps this reviewable: the agent triages dozens of
signatures, never thousands of raw events. Natural cadence: a nightly
scheduled agent run reviewing rollup + latest harness manifest together —
harness says *what broke functionally*, telemetry says *what users actually
hit and how often*.

## 8. Execution

```bash
# package.json (apps/studio)
"test:prod-ux": "PLAYWRIGHT_PROD_SMOKE=1 playwright test --config playwright.prod.config.ts --grep-invert @smoke-only",
"test:prod-smoke": "(unchanged)"
```

- Local/agent invocation: `pnpm --filter @rune-langium/studio run test:prod-ux`
  (optionally `PLAYWRIGHT_BASE_URL` for a preview deploy).
- Suggested cadence: after every production deploy (CI job keyed on Pages
  deploy success) and nightly. Nightly uploads `report/` as an artifact and
  invokes the `prod-ux-review` skill on it.
- Budget: full run target **< 20 min** (dominated by 2–3 CDM loads; journeys
  share a CDM-loaded page via serial `test.describe.serial` groups where safe).

## 8. Phasing

- **Phase 0 (instrumentation, parallelizable):** §6 opLog service + Activity/
  Output panel wiring + telemetry/worker correlation. Own PR; user-facing
  value on its own.
- **Phase 1 (harness core):** fixture + evidence collector + manifest writer
  (incl. per-op timing table); absorb prod-smoke as J0/J3/J4; add J1, J2, J5,
  J6, J7 (pure-read journeys).
- **Phase 2 (mutation loop + completeness):** J8–J11, J18 (edit,
  form/function one-of-each, lens, codegen, type-closure walk).
- **Phase 3 (dialog surfaces):** J12–J15.
- **Phase 4 (resilience + a11y):** J16, J17; wire nightly CI + review-skill
  handoff; switch §4 timings to opLog-sourced where Phase 0 has landed.
- **Phase 5 (real-user telemetry, §7):** `op_spans` ingest event + aggregator
  extensions + `/v1/digest` on the existing telemetry worker; client
  error/vitals capture; `telemetry:digest` script; review-skill telemetry
  mode; nightly combined review (harness manifest + fleet rollup).

## 9. Open questions

1. ~~J9 anchoring~~ **Resolved:** one of each — curated ⚓ AND scratch-authored,
   for both functions and data types; the pairing itself disambiguates
   corpus-drift from regression.
2. Does the deployed site expose `window.__STUDIO_TEST_API__` (`test-api.ts`) in
   prod builds? If not, all journeys must stay strictly DOM-driven (assumed) and
   the §6 ring-buffer read hook needs a prod-safe, read-only exposure decision.
3. Whether `serious` axe findings should hard-fail after one quarter of ledger
   burn-down.
4. J18 closure size for the curated root: the full transitive closure of a big
   CDM type can be hundreds of types. Cap by count (e.g. first 150 visited,
   logged as truncated in the manifest — no silent caps) or pick a mid-size
   anchor whose closure is naturally bounded?
