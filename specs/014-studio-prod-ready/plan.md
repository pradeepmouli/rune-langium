# Implementation Plan: Studio Production Readiness

**Branch**: `014-studio-prod-ready` | **Date**: 2026-04-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/014-studio-prod-ready/spec.md`

## Summary

Close the gap between feature 012's shipped Studio bundle (currently
non-functional in production) and what the spec promised. The work
splits cleanly into **operational** (deploy the three Workers + seed
R2 + populate production secrets) and **code** (wire `archiveLoader`,
import `dockview-react` CSS, host the LSP server on Cloudflare via a
Worker + Durable Object, surface user-facing copy, fix workspace
restore-on-reload, add the GitHub Device-Flow start-page affordance,
tighten Worker route precedence, retire the legacy `cors.isomorphic-git.org`
fallback, and add a Playwright e2e for the curated-load happy path).

The single load-bearing technical decision is **C3**: whether
langium boots in a CF Worker isolate. A 1-day spike runs FIRST; if it
passes, build the `apps/lsp-worker` + `RuneLspSession` DO; if it
fails, fall back to "accept read-only Studio in production" with a
documentation rewrite. The plan is structured so phases 1–3 can land
in any order while phase 4 (LSP) waits on the spike outcome.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict mode, ESM) for all new
code; existing apps already on this version.
**Primary Dependencies**:
- New: `@cloudflare/workers-types`, `wrangler@4`, `langium@4.2.x`
  (already in `packages/core`), `vscode-languageserver/browser`
- Existing (carried): `dockview-react@4.13`, `idb@8`,
  `isomorphic-git`, `pako`, `@xyflow/react`, `react@19`
**Storage**:
- R2 bucket `rune-curated-mirror` (created, empty — must be seeded)
- Durable Objects: `TelemetryAggregator` (existing), `RuneLspSession`
  (new, holds langium state + a hibernating WebSocket)
- IndexedDB on the client (workspace metadata)
- OPFS on the client (workspace files)
**Testing**: vitest for unit/integration; Playwright for e2e (axe-core,
new curated-load happy path); existing `studio-a11y` CI job extended
with a `studio-curated-e2e` job.
**Target Platform**:
- Studio: modern desktop browsers (Chromium 120+, Firefox 120+,
  Safari 17+) at ≥1280×800.
- Workers: Cloudflare Workers paid plan (30s CPU per request),
  `nodejs_compat` enabled.
- LSP DO: 128MB memory, hibernating WebSocket via `acceptWebSocket()`.
**Project Type**: Web application — `apps/studio` (browser) +
multiple `apps/*-worker` (Cloudflare Workers).
**Performance Goals**:
- Curated cold load <60s on 50 Mbps (SC-001).
- Cached restore <5s (SC-002).
- LSP diagnostics latency <2s; hover/autocomplete <1s (SC-005).
- `verify-production.sh` 0 failures (SC-003).
**Constraints**:
- Paid CF Workers plan required (free 50ms is insufficient for
  langium parse).
- LSP DO memory bounded at 128MB (CDM AST fits, verify in spike).
- All 012 privacy invariants preserved (telemetry closed schema,
  no token persistence in github-auth, daily-rotating IP-hash).
- No regressions on the existing 1356 workspace tests.
**Scale/Scope**:
- 6 user stories, 21 functional requirements, 10 success criteria.
- ~12 source files modified, ~8 new files added (worker + DO + UI
  affordances + e2e), ~3 docs rewrites (README, status copy,
  spec section in `apps/studio/README.md`).
- Two PRs likely: one for B1b/B2/B3/C1/C2/C4/C5 (deploy + wire +
  UI), one for C3 (LSP-on-CF-Worker, gated by spike).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Notes |
|---|---|---|
| **I. DSL Fidelity & Typed AST** | ✅ | No grammar / AST / scope changes. The LSP DO consumes the existing langium services unchanged. |
| **II. Deterministic Fixtures** | ✅ | Curated-load e2e (FR-020) uses the existing `apps/studio/test/fixtures/curated/tiny.tar.gz` vendored fixture; no live R2 access in tests. The langium-in-CF-Worker spike uses a vendored `.rosetta` fixture. |
| **III. Validation Parity** | ✅ | Diagnostics surface (SC-005) is the existing langium validator running in a CF Worker isolate; no rule changes. |
| **IV. Performance & Workers** | ✅ | Parsing latency budgets unchanged (langium runs in a CF Worker isolate now instead of a non-existent browser Worker). LSP-DO cold-start budget added: <3s first-message-after-spawn (verified by the spike). |
| **V. Reversibility & Compatibility** | ✅ | If the C3 spike fails, fallback is documentation-only — no breaking change to the existing `transport-provider.ts` API surface; the WebSocket path stays as-is and the embedded-Worker leg becomes "permanently disabled." |
| **Workflow Quality Gates (Feature Development)** | ✅ | Spec complete, plan in progress, TDD will apply during `/speckit.implement`, code review on PRs. |

**Result**: PASS. No violations to track in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/014-studio-prod-ready/
├── plan.md              # This file (/speckit.plan output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── lsp-worker.md           # WebSocket-upgrade route + DO message protocol
│   ├── studio-config.md        # New env vars (VITE_LSP_WS_URL etc.)
│   └── verify-production.md    # Wire shape of the smoke-check script
├── checklists/
│   └── requirements.md  # Already exists from /speckit.specify
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT this command)
```

### Source Code (repository root)

```text
apps/
├── lsp-worker/                       # NEW (Phase 4 — gated by C3 spike)
│   ├── package.json
│   ├── wrangler.toml                 # Route: /rune-studio/api/lsp/*
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                  # Worker entry; route + WS upgrade
│   │   ├── session.ts                # RuneLspSession DO
│   │   ├── auth.ts                   # Origin allowlist + session token
│   │   └── log.ts                    # Pino redact set (mirror codegen-worker)
│   └── test/
│       ├── upgrade.test.ts           # WS upgrade contract
│       └── session.test.ts           # DO message routing
│
├── docs/                             # MODIFIED (Phase 6)
│   └── .vitepress/theme/custom.css   # consume @rune-langium/design-tokens
│
├── studio/                           # MODIFIED
│   ├── src/
│   │   ├── App.tsx                   # workspace-restore on boot (C4)
│   │   ├── components/
│   │   │   ├── FileLoader.tsx        # add Open-from-GitHub affordance (C5)
│   │   │   ├── GitHubConnectDialog.tsx  # already exists; wire to start page
│   │   │   └── WorkspaceSwitcher.tsx # already exists; mount on App
│   │   ├── pages/EditorPage.tsx      # workspace restore wiring
│   │   ├── services/
│   │   │   ├── transport-provider.ts # C3 — new Step-3 = wss://CF/lsp/ws
│   │   │   ├── telemetry.ts          # FR-021 (env-config), already partially wired
│   │   │   └── model-loader.ts       # B2 — wire archiveLoader through
│   │   ├── store/model-store.ts      # B2 — pass archiveLoader: loadCuratedModel
│   │   ├── shell/
│   │   │   ├── DockShell.tsx         # B3 — verify dockview CSS imported
│   │   │   ├── layout-factory.ts     # C1 — add PANEL_TITLES map
│   │   │   └── dockview-bridge.ts    # C1 — pass title= on addPanel
│   │   │   └── styles.css                # B3 + Phase 6 — dockview CSS import; reference defined --space-* tokens
│   └── test/
│       ├── e2e/
│       │   ├── a11y.spec.ts          # existing
│       │   └── curated-load.spec.ts  # NEW — FR-020 happy-path e2e
│       └── services/
│           └── transport-provider.test.ts  # C3 — covers WS to CF endpoint
│
├── telemetry-worker/                 # MODIFIED (route precedence + I3)
│   └── wrangler.toml                 # tighten route patterns
│
├── github-auth-worker/               # NO CHANGES (already deployed by B1b)
│
├── curated-mirror-worker/            # MODIFIED (route precedence + cron-seed)
│   └── wrangler.toml
│
└── codegen-worker/                   # MODIFIED (FR-007 — narrow route pattern)
    └── wrangler.toml                 # change from /api/* to /api/codegen/*

packages/
├── design-tokens/                    # MODIFIED (Phase 6)
│   ├── src/tokens.json               # add `font`, `syntax`, full `--space-*` scale
│   └── src/build.ts                  # emit a brand.css + the existing tokens.css
└── design-system/                    # MODIFIED (Phase 6)
    └── src/
        ├── theme.css                 # define --space-*, --text-md, --sidebar-* (FR-025); --font-sans ← Outfit (FR-022); --radius-md = 8px (FR-024)
        └── ui/button.tsx             # secondary → transparent + bordered (FR-023)

site/                                 # MODIFIED (Phase 6)
└── index.html                        # consume @rune-langium/design-tokens/brand.css

scripts/
└── verify-production.sh              # MODIFIED — extend with LSP probe (Phase 4)

specs/_deferred/
├── 012-production-gaps.md            # superseded by this feature; mark closed
├── ux-polish-cross-surface.md        # superseded by this feature; mark closed
└── inspector-z2f-migration.md        # remains open (separate feature)
```

**Structure Decision**: The repo is an existing pnpm-workspace monorepo
with `apps/*` (Studio + Workers) and `packages/*` (libraries). This
feature adds **one new app** (`apps/lsp-worker`) and modifies
existing apps; no new packages. The new app mirrors the structure of
`apps/telemetry-worker` and `apps/github-auth-worker` so the deploy
runbook scales without bespoke per-Worker steps.

The feature is split into **5 phases**, each independently
shippable to production:

1. **Phase 1 — Operational unblock** (B1b): deploy the three existing
   012 Workers + seed R2 + tighten codegen-worker's route. Pure ops;
   no code changes. Completion verified by `pnpm run verify:prod`
   reporting all-pass *except* the LSP probe (Phase 4).
2. **Phase 2 — Curated-load wiring** (B2, B3, C1, C2): the four
   single-file fixes that make the existing 012 bundle actually
   functional once the Workers are up. Includes the legacy
   `cors.isomorphic-git.org` retirement (FR-019).
3. **Phase 3 — Workspace restore + GitHub UI** (C4, C5): wire the
   workspace switcher and Open-from-GitHub dialog into the start page.
4. **Phase 4 — LSP host** (C3, gated by spike): the only multi-week
   item. Spike runs at the start of this phase and is the gate for
   the rest.
5. **Phase 5 — Polish + e2e** (FR-020, FR-021, P1 finishing,
   `verify-production.sh` extension): close any remaining tasks and
   the Playwright happy-path test.
6. **Phase 6 — Cross-surface UX consistency** (US7, FR-022–FR-030):
   merge the deferred polish spec into this feature. Lifts brand
   tokens (font, palette, syntax colours, surface hex) into a single
   shared source emitted by `@rune-langium/design-tokens`; defines
   the missing `--space-*` / `--text-md` / `--sidebar-width` scale in
   `theme.css` (closes the "muddled layout" root cause); reshapes the
   Studio's `Button variant="secondary"` to transparent + bordered;
   normalises the focus-visible ring across all three surfaces;
   reshapes the empty-state hierarchy; replaces hard-coded
   diagnostic hex with token references; and adds a CI guard that
   fails the build if `apps/studio/src/styles.css` introduces an
   undefined `var(--…)` reference. Phase 6 can run in parallel with
   Phases 2–5; the only ordering constraint is that Phase 1 (deploy)
   has no dependency on it.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations identified. All five principles + the
feature-development quality gate pass cleanly. The new
`apps/lsp-worker` is justified by Principle IV (workers); it is not a
new abstraction layer but the natural fit for "performance-bound
parsing in a worker isolate" applied to the deployment dimension.
