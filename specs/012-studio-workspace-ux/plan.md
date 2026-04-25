# Implementation Plan: Studio Workspace + IDE-Style UX Polish

**Branch**: `012-studio-workspace-ux` | **Date**: 2026-04-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-studio-workspace-ux/spec.md`

## Summary

Five overlapping deliverables on Studio + the surrounding apps:

- **US1 / FR-001–008** — Replace the runtime git clone of curated models with a CF Worker + R2 mirror that is refreshed nightly via Cron. Studio fetches one tar.gz per model, untars in-browser, writes into OPFS. Removes the third-party CORS proxy from the deployed-app load path. Arbitrary-URL git loading and the new GitHub-as-workspace-backing flow keep using `isomorphic-git`.
- **US2 / FR-010–018** — Move from the current single-file `LightningFS`-backed shell to real workspaces: multi-file, multi-model, persistent across sessions, with the option of a folder-backed (FSA) or git-backed (GitHub) source of truth. OPFS becomes the primary store; IndexedDB holds metadata.
- **US3 / FR-020–026** — Adopt `dockview-react` for a six-panel IDE-style layout, with collapsible side rails, draggable tabbed editor, persistent layout per workspace, and small-viewport defaults that reclaim editor area.
- **US4 / FR-030–033** — Stand up `@rune-langium/design-tokens` plus an upgraded `@rune-langium/design-system` package shared across landing site, docs (VitePress), and Studio. Visual coherence becomes a property of the build, not a manual sync.
- **US5 / FR-Z01–Z06** — Bump `@zod-to-form/{core,react,cli}` from 0.4.0 to 0.7.1, add `@zod-to-form/vite@0.2.1`, migrate from CLI-with-committed-output to `?z2f` query-string imports. Delete `packages/visual-editor/src/components/forms/generated/`. Audit consumption against the upstream canonical examples and remove any legacy workarounds.

Cross-cutting: WCAG 2.1 AA for new UI (FR-A01–A05), opt-out anonymised telemetry to a CF Worker (FR-T01–T05), versioned migrations from the legacy `LightningFS` cache (FR-017).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict mode, ESM) for all browser + Worker code; Java 21 unchanged for the existing codegen container (untouched by this feature).
**Primary Dependencies**: React 19, `dockview-react` (new), `@zod-to-form/{core,react,vite}` 0.7.x / 0.2.x (upgrade), `isomorphic-git` 1.37 (existing, retained for arbitrary-URL + git-backed workspaces), `pako` (new — gzip), small custom tar parser or `tar-stream` (new), `idb` (existing), Tailwind CSS 4 (existing), VitePress (existing for docs), Cloudflare Workers + R2 + Durable Objects + Cron Triggers.
**Storage**: OPFS (Origin Private File System) for workspace files + git object stores; IndexedDB for workspace metadata, recent-workspaces, settings, and serialised FSA folder handles. R2 for the curated-mirror archives. Durable Object storage for telemetry counters (per-day instances). No D1, no KV.
**Testing**: vitest (existing) for unit + integration; Playwright (existing in `apps/studio`) for end-to-end including the dockable layout, the curated-load happy path, and the form-codegen HMR flow. `axe-core` automated a11y in CI (new). Wrangler local dev for Worker integration tests.
**Target Platform**: Modern Chromium / WebKit / Firefox with OPFS support (effectively the same matrix that already supports FSA in Studio). Production deploy at `www.daikonic.dev`. No mobile portrait; viewports < 768px wide show a "use a larger screen" message.
**Project Type**: Web application — multi-app monorepo (existing). Adds three new Worker apps and two new shared packages.
**Performance Goals**: First-load CDM ≤ 60s on 50 Mbps (SC-001). Cached load ≤ 5s (SC-002). Workspace restore ≤ 5s (SC-004). HMR on schema edit ≤ 2s (SC-011). Layout-resize is 60fps with no visible jank.
**Constraints**: No backend account model. No third-party data processors. Telemetry is opt-out and PII-free. Workspace files never leave the user's device unless they explicitly use the GitHub backing flow.
**Scale/Scope**: Single-user-per-tab. Workspaces in the low tens per user. CDM corpus is ~500 files / few MB compressed. Curated mirror serves all visitors; expected steady state under 10 RPS on the manifest endpoint, far below CF free-tier thresholds.

## Constitution Check

Reviewed against `.specify/memory/constitution.md` v1.1.1.

| Principle | Status | Notes |
|---|---|---|
| I. DSL Fidelity & Typed AST | ✅ N/A | This feature does not touch the parser, AST, or scoping. |
| II. Deterministic Fixtures | ⚠️ Watch | The integration tests for the curated-mirror flow MUST use a vendored tar.gz fixture, not the live R2 endpoint. The manifest contract has its own contract test against a fixture manifest. The Cron Worker is exercised in unit tests with a mocked R2 client; its end-to-end correctness is covered by a deploy-time smoke test, not the unit suite (consistent with existing CF Worker patterns from feature 011). |
| III. Validation Parity | ✅ N/A | No grammar / scoping / validation changes. |
| IV. Performance & Workers | ✅ Aligns | Untarring runs in a Web Worker so it doesn't block the editor. Parser still in its existing Web Worker (unchanged). New benchmark: workspace-open and curated-untar latency, added to the existing perf suite. |
| V. Reversibility & Compatibility | ✅ Aligns | Legacy `LightningFS` migration is one-shot and preserves the user's existing single-file content into a default workspace (FR-017). Layout JSON is versioned with a transformer pipeline (FR-025). Adapter layer between dockview and our panel registry means swapping libraries later is contained. |

**General gates**:

- Performance benchmarks: a new bench is added for tar-decode + OPFS-write throughput.
- Lint and test: required to pass before merge — nothing in this feature waives that.

**Result**: passes. No constitution violations. Complexity Tracking section omitted.

## Project Structure

### Documentation (this feature)

```
specs/012-studio-workspace-ux/
├── plan.md                              # this file
├── research.md                          # Phase 0
├── data-model.md                        # Phase 1
├── quickstart.md                        # Phase 1
├── contracts/
│   ├── curated-mirror-http.md
│   ├── github-auth-worker.md
│   ├── telemetry-event.md
│   └── dockview-panel-registry.md
├── checklists/
│   └── requirements.md                  # already passing from /specify
└── tasks.md                             # produced by /speckit.tasks (NOT this command)
```

### Source code (repository root, post-implementation)

```text
apps/
├── studio/                              # existing — heavily edited
│   ├── src/
│   │   ├── workspace/                   # NEW — workspace runtime (OPFS-backed)
│   │   │   ├── workspace-manager.ts
│   │   │   ├── workspace-store.ts       # zustand store
│   │   │   ├── persistence.ts
│   │   │   └── migrations/              # legacy lightning-fs → OPFS
│   │   ├── opfs/                        # NEW — OPFS adapters + isomorphic-git FS shim
│   │   │   ├── opfs-fs.ts               # the isomorphic-git-shaped fs object
│   │   │   ├── opfs-paths.ts
│   │   │   └── tar-untar.ts             # in-browser tar+gzip extraction
│   │   ├── shell/                       # NEW — dockview-based IDE shell
│   │   │   ├── DockShell.tsx
│   │   │   ├── ActivityBar.tsx
│   │   │   ├── StatusBar.tsx
│   │   │   ├── panels/
│   │   │   │   ├── FileTreePanel.tsx
│   │   │   │   ├── EditorPanel.tsx
│   │   │   │   ├── InspectorPanel.tsx   # hosts z2f forms (US5)
│   │   │   │   ├── ProblemsPanel.tsx
│   │   │   │   ├── OutputPanel.tsx
│   │   │   │   └── VisualPreviewPanel.tsx
│   │   │   ├── layout-factory.ts
│   │   │   └── layout-migrations.ts
│   │   ├── services/
│   │   │   ├── curated-loader.ts        # NEW — fetches R2 archive, writes OPFS
│   │   │   ├── github-auth.ts           # NEW — device-flow client
│   │   │   ├── git-backing.ts           # NEW — isomorphic-git driving for git-backed ws
│   │   │   ├── telemetry.ts             # NEW — POSTs to telemetry-worker
│   │   │   ├── multi-tab-broadcast.ts   # NEW — BroadcastChannel ownership
│   │   │   ├── codegen-service.ts       # existing (untouched in v0)
│   │   │   ├── model-registry.ts        # existing (lightly edited)
│   │   │   ├── model-loader.ts          # REWRITTEN — now thin façade over curated-loader OR isomorphic-git
│   │   │   └── workspace.ts             # MIGRATED — re-uses workspace-manager
│   │   └── pages/
│   │       └── EditorPage.tsx           # rewritten to mount DockShell
│   ├── tests/
│   │   ├── workspace/                   # NEW unit
│   │   ├── opfs/                        # NEW unit
│   │   └── e2e/                         # existing playwright; new specs added
│   └── vite.config.ts                   # add z2fVite() plugin (US5)
│
├── docs/                                # existing — design-token consumption
│   └── .vitepress/theme/
│       └── tokens.css                   # NEW — imports @rune-langium/design-tokens
│
├── site/                                # existing — design-token consumption
│   └── src/
│       └── tokens.css                   # NEW
│
├── codegen-worker/                      # existing — untouched
├── codegen-container/                   # existing — untouched
│
├── curated-mirror-worker/               # NEW — Cron + R2 publisher
│   ├── src/
│   │   ├── index.ts                     # entry; scheduled handler
│   │   ├── publisher.ts                 # downloads + uploads each curated source
│   │   ├── manifest.ts                  # builds CuratedManifest
│   │   └── log.ts
│   ├── test/
│   ├── wrangler.toml                    # cron + R2 binding + observability
│   ├── package.json
│   └── tsconfig.json
│
├── github-auth-worker/                  # NEW — device-flow mediator
│   ├── src/
│   │   ├── index.ts                     # routes /device-init, /device-poll
│   │   └── log.ts
│   ├── test/
│   ├── wrangler.toml
│   └── package.json
│
└── telemetry-worker/                    # NEW — event ingest + DO counters
    ├── src/
    │   ├── index.ts
    │   ├── counters.ts                  # Durable Object
    │   └── log.ts
    ├── test/
    ├── wrangler.toml
    └── package.json

packages/
├── design-tokens/                       # NEW
│   ├── src/
│   │   ├── tokens.json                  # canonical token values
│   │   └── build.ts                     # emits dist/tokens.css + dist/tokens.ts
│   ├── dist/                            # built output (generated)
│   └── package.json
│
├── design-system/                       # existing — heavily expanded
│   ├── src/
│   │   ├── primitives/                  # Button, Link, Input, Heading, Code, Toast, Dialog, ...
│   │   ├── tokens/                      # re-export @rune-langium/design-tokens
│   │   └── theme.tsx
│   └── package.json
│
├── visual-editor/                       # existing — z2f migration
│   ├── src/
│   │   ├── components/
│   │   │   ├── forms/
│   │   │   │   ├── MapFormRegistry.ts   # rewritten to use @zod-to-form/core's exported types
│   │   │   │   ├── generated/           # DELETED (FR-Z02)
│   │   │   │   └── ...
│   │   │   └── editors/                 # call sites switch to ?z2f imports
│   │   └── schemas/                     # existing zod schemas
│   ├── z2f.config.ts                    # updated for 0.7.x (component, not fieldType)
│   └── package.json
│
└── (other packages unchanged)

specs/
└── 012-studio-workspace-ux/             # this feature's spec dir
```

**Structure Decision**: monorepo grows from 2 Worker apps + N packages to **5 Worker apps + N+1 packages**. The new `design-tokens` package is the only structural split — `design-system` was already a package, and the three new Workers follow the same scaffold as `apps/codegen-worker`. No new app at the page-app tier; everything Studio-side stays inside `apps/studio`.

## Phase ordering & dependency graph

The plan's natural execution order is **US1 → US2 → US3 → US5 → US4**, with US4 last because it touches every surface the others have already disturbed. US5 lands after US3 because the inspector panel (US3) hosts the migrated forms.

A parallel track for the back-end Workers (curated-mirror, github-auth, telemetry) runs alongside US1-US3 since they don't block each other.

| Phase | Deliverables | Blocks | Blocked by |
|---|---|---|---|
| **A** Curated mirror infra | `curated-mirror-worker`, R2 bucket, first nightly run, manifest contract test | US1 client work | none |
| **B** US1 client | `curated-loader.ts`, `tar-untar.ts`, OPFS write path, error catalogue | US2 (workspace shell needs the loader) | A |
| **C** US2 — workspace + OPFS | `workspace-manager`, `opfs-fs`, multi-tab broadcast, persistence, lightning-fs migration | US3 (dock shell hosts workspaces) | B |
| **D** US3 — dock shell | `DockShell`, six panels, layout factory + migrations, a11y plumbing | US5 (inspector panel hosts forms) | C |
| **E** US5 — z2f migration | upgrade deps, `?z2f` import call sites, delete generated dir, audit fix-ups | US4 (design tokens used by the new primitive forms) | D |
| **F** US4 — design tokens + cross-app | `design-tokens` package, `design-system` expansion, VitePress + landing-site wiring, chrome reduction | nothing | C+ in parallel; finalised after E |
| **G** Telemetry + GitHub-auth Workers | `telemetry-worker`, `github-auth-worker`, settings toggle | none of the above (parallel) | none |
| **H** Verification | E2E (Playwright), a11y CI gate, perf bench, deploy runbook | release | A–G |

Tasks generation (`/speckit.tasks`) will materialise this graph into ~40-60 ordered tasks across the eight phases, with parallelisable tasks tagged `[P]` and per-user-story tagging `[US1]`–`[US5]` per the spec-kit conventions.

## Phase 0: Research

Complete. See [research.md](./research.md). Ten research items resolved (R1–R10), no `NEEDS CLARIFICATION` remain.

Key decisions:

1. R1: `@zod-to-form` 0.4.0 → 0.7.1 + `@zod-to-form/vite` 0.2.1 query-string mode. Two breaking changes (0.5.0 removed deprecated aliases, 0.6.0 unified `fieldType` → `component`) require touch-up in `MapFormRegistry.ts` and `z2f.config.ts`.
2. R2: OPFS as primary; vendored `opfs-fs.ts` adapter for isomorphic-git. Lightning-fs migration is one-shot, lazy.
3. R3: CF Cron Worker → R2 with date-stamped + `latest` tar.gz + `manifest.json`. 14-archive retention.
4. R4: `dockview-react`. Six-panel registry locked.
5. R5: New `@rune-langium/design-tokens` JSON-driven package; existing `design-system` becomes the React primitive layer; VitePress + landing site consume the CSS-variable output.
6. R6: GitHub OAuth Device Flow via a thin CF worker; token in OPFS scoped to workspace.
7. R7: Telemetry Worker — fixed-schema events, DO-per-day counters, no PII.
8. R8: Workspace persistence — IndexedDB metadata + OPFS tree; explicit lifecycle ops.
9. R9: Multi-tab — BroadcastChannel ownership, second tab read-only.
10. R10: Panel `componentName` registry — six fixed names locked in [contracts/dockview-panel-registry.md](./contracts/dockview-panel-registry.md).

## Phase 1: Design & Contracts

Complete. Artifacts:

- [data-model.md](./data-model.md) — IndexedDB stores, OPFS layout, R2 layout, telemetry payload, design-token namespaces, lightning-fs migration, versioning rules.
- [contracts/curated-mirror-http.md](./contracts/curated-mirror-http.md) — manifest + archive HTTP surface.
- [contracts/telemetry-event.md](./contracts/telemetry-event.md) — event schema + privacy posture.
- [contracts/github-auth-worker.md](./contracts/github-auth-worker.md) — device-flow surface.
- [contracts/dockview-panel-registry.md](./contracts/dockview-panel-registry.md) — locked component names + keyboard contract + a11y roles.
- [quickstart.md](./quickstart.md) — end-to-end happy path.

### Constitution re-check (post-design)

Same status as the pre-design check. Two specific watch-points the /tasks output must respect:

- Principle II (Deterministic Fixtures): the integration test for the curated-mirror client uses a vendored fixture archive, not the live R2 endpoint. Listed as a task constraint.
- Principle IV (Performance & Workers): tar-decode runs in a Web Worker. Listed as a task constraint, and the existing perf bench is extended.

## Complexity Tracking

No constitution violations to justify.

---

## Open items deferred to /tasks

These are not unresolved questions — they are decisions that belong at the
task level, not the design level:

- Exact split of work between `apps/studio/src/workspace/` and the existing `services/workspace.ts` (needs an in-place rename plan).
- ~~Whether to bring `LightningFS` along read-only for one release as a fallback, or do the cut clean~~ — **decided**: cut clean. FR-017 mandates a one-shot migration that deletes the legacy stores in the same pass. No LightningFS code path survives into the release. `pnpm why @isomorphic-git/lightning-fs` MUST return nothing after the migration tasks land.
- Per-panel keyboard shortcut implementation library (`useHotkeys` vs `react-hotkeys-hook` vs custom).
- Bundle-size budget for the in-browser tar parser; `tar-stream` is heavy, a custom 200-line decoder may suffice.

`/speckit.tasks` will turn the eight phases above into individual tasks with the tagging convention (`[P]` parallel, `[US1]`–`[US5]` story).
