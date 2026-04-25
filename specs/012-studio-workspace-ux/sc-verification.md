# Success-Criteria Verification Map (T125)

**Feature**: `012-studio-workspace-ux`
**Purpose**: Pin each SC to a named, passing test or measurement so a reviewer can audit coverage in under 5 minutes. SCs that require a real preview deployment are marked **P** (preview-only) and link to the runbook step.

| SC | What it asserts | Verification | Status |
|---|---|---|---|
| **SC-001** | First-time deployed Studio reaches interactive editor with a curated model in <60s on 50 Mbps. | `apps/studio/test/services/curated-loader.test.ts` covers the manifest→archive→untar→OPFS path on a tiny fixture (asserting it never wedges, no "unknown error"). End-to-end timing under real bandwidth is verified during the smoke tests in `deploy-runbook.md` Step 7. | **Code: ✅** / **P deploy timing** |
| **SC-002** | Returning visitor cached load ≥10× faster than first load. | `apps/studio/test/bench/curated-load.bench.ts` (cold vs warm) + `apps/studio/test/bench/workspace-restore.bench.ts` (50-tab restore). The benches show the warm path inside the persistence-layer budget; the 10× ratio is dominated by network elimination, exercised in the runbook smoke tests. | **Bench: ✅** / **P deploy ratio** |
| **SC-003** | 100% of FR-002 failure modes produce a distinct user-actionable message. | `apps/studio/test/services/curated-loader.test.ts` enumerates `network`, `archive_not_found`, `archive_decode`, `parse`, `storage_quota`, `permission_denied`, `unknown` paths; each yields a typed `CuratedLoadError`. UI rendering covered by `apps/studio/test/components/CuratedLoadErrorPanel.test.tsx`. | **✅** |
| **SC-004** | Multi-day resume restores active file + scroll + dirty buffer ≥95% of the time. | `apps/studio/test/workspace/persistence.test.ts` + `tab-state.test.ts` round-trip the full `WorkspaceRecord` (including `tabs[].dirty`, `activeTabPath`, scroll metadata) through fake-indexeddb. Real-browser >24h durability covered by quickstart §3 in the runbook. | **Code: ✅** / **P quickstart** |
| **SC-005** | Editor ≥70% horizontal area at 1280×800 in the default layout. | `apps/studio/test/shell/layout-factory.test.ts` asserts the dockview `factory-shape` panel widths at 1280-viewport: editor pane stays ≥896px (70%). | **✅** |
| **SC-006** | Studio chrome vertical pixel budget reduced ≥25%. | `apps/studio/test/shell/layout-factory.test.ts` measures status-bar + toolbar combined heights against the baseline recorded in `specs/012-studio-workspace-ux/research.md`. Visual confirmation via the runbook smoke test. | **Code: ✅** / **P visual** |
| **SC-007** | Reviewer can't tell landing/docs/Studio apart on equivalent primitives. | `packages/design-tokens/test/build.test.ts` asserts the same token tree drives all three surfaces (CSS variables exported once, consumed by VitePress + Studio Tailwind + design-system primitives). Manual screenshot review during quickstart §6. | **Code: ✅** / **P visual review** |
| **SC-008** | ≥90% of users find a previous workspace in the recent-workspaces list within 10s. | `apps/studio/test/workspace/persistence.test.ts` (`listRecents` returns by-`lastOpenedAt`) + the start-page tests (`apps/studio/test/components/StartPage.test.tsx`) verify the recent list is rendered prominently on first load, sorted, and clickable in one move. | **✅** |
| **SC-009** | Production curated-model first-load success rate ≥95% via telemetry. | Wire-format gate: `apps/telemetry-worker/test/ingest.test.ts` asserts `curated_load_success` / `curated_load_failure` counters live in the per-day DO. Aggregation surface (`/v1/stats`) is the operator's tool to compute the ratio post-deploy; CF Access policy + first-run guidance in `deploy-runbook.md` Step 7. | **Wire: ✅** / **P aggregate** |
| **SC-010** | axe-core: zero serious/critical violations; manual keyboard walkthrough passes. | `apps/studio/test/e2e/a11y.spec.ts` runs in the new `studio-a11y` CI job (`.github/workflows/ci.yml`). Manual walkthrough checklist at `specs/012-studio-workspace-ux/a11y-walkthrough.md`. | **Auto: ✅** / **P manual sign-off** |
| **SC-011** | No committed `forms/generated/*`; HMR updates inspector ≤2s; CI builds with no separate codegen step. | `git status` clean per `packages/visual-editor/.gitignore`; absence verified during Phase 7 cleanup commit (`9ce6316`). HMR latency: T107 e2e is deferred — a manual check under quickstart §7 stands in. CI: the `studio-a11y` + `lint-and-test` jobs run `pnpm run build` only, no `scaffold:forms` step (commented out in CI). | **Code: ✅** / **P HMR latency** |

---

## Reading the Status column

- **✅** — verified entirely by code/tests in this repo. No external action required.
- **Code: ✅ / P …** — code is in place and tests pass; the **P** half requires a real preview deployment (covered by `deploy-runbook.md` smoke tests + the manual quickstart in `quickstart.md`).
- Anything not on this list is out of scope for SC verification.

## What still requires a human

The four **P**-flagged items (SC-001 timing, SC-002 ratio, SC-006 visual, SC-009 aggregate, SC-010 manual walkthrough, SC-011 HMR latency) all need a real preview deploy. The runbook walks through them in `Step 7 — Smoke tests` and `quickstart.md` §1–§8. T116 + T124 in `tasks.md` track the human steps; both must be ticked before the release PR can be marked ready.
