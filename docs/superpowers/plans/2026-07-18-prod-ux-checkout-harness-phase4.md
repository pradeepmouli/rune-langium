# Prod UX Checkout Harness — Phase 4 (nightly cadence + budget-aware verdicts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out `docs/superpowers/specs/2026-07-16-prod-ux-checkout-harness.md` §8's Phase 4 ("resilience + a11y: J16, J17; wire nightly CI + review-skill handoff; switch §4 timings to opLog-sourced where Phase 0 has landed"). J16/J17 already shipped as part of the "Phase 3" implementation branch (PR #398) — the genuinely open scope is the other three items: (1) a manifest-level, budget-aware `timings[]` roll-up that downgrades a journey to `DEGRADED` when an operation blows its soft budget, (2) a nightly GitHub Actions workflow that runs `test:prod-ux` against the real deployed Studio and uploads the evidence bundle, and (3) a persistent scheduled cloud routine that picks up that nightly artifact and runs the `prod-ux-review` skill against it, filing a GitHub issue when it finds a real regression.

**Architecture:** Everything the harness needs already exists — `apps/studio/src/services/op-log.ts` (Phase 0, merged), `EvidenceCollector`/`appendJourneyRecord` (Phase 1, merged), and 18 journey spec files (Phases 1–3, merged) that already populate each `JourneyRecord.opLog` from `window.__runeStudioOpLog`. This phase adds one new pure module (`timings.ts`) that aggregates already-recorded `opLog` durations against the spec §4 budget table — no new instrumentation, no new logging mechanism (repo rule: DRY, never a parallel implementation of something that already exists). CI and scheduling are additive: a new workflow file, and a new persistent routine created via the `schedule` skill (NOT the session-scoped `CronCreate` tool, which is deleted when this session ends and auto-expires after 7 days regardless — unsuitable for a "nightly, indefinitely" requirement).

**Tech Stack:** TypeScript 5.9 strict/ESM, Vitest 3, Playwright (`playwright.prod.config.ts`), GitHub Actions (`actions/upload-artifact@v7`, matching this repo's other workflows), `gh` CLI (already used by the `prod-ux-review` skill's operators), the `schedule` skill for the persistent nightly routine.

## Global Constraints

- FSL-1.1-ALv2 SPDX header (`// SPDX-License-Identifier: FSL-1.1-ALv2` + `// Copyright (c) 2026 Pradeep Mouli`) on every new/modified file under `apps/studio/` — this whole plan is FSL, not MIT.
- No parallel implementations: the timings roll-up reads `JourneyRecord.opLog` (already populated by the existing `readOpLog`/`window.__runeStudioOpLog` machinery) — it must never introduce a second timing-capture mechanism or duplicate the op→budget table anywhere else in the codebase.
- Budgets are **soft**: exceeding one marks a journey `DEGRADED`, never `FAIL` (spec §4: "only the journey's hard timeouts fail a run"). The nightly CI workflow itself must never fail the build on a red/degraded journey — it is an evidence-gathering job, not a PR gate (unlike `studio-a11y` in `ci.yml`, which does gate).
- The nightly workflow must never authenticate GitHub or invoke destructive/mutating production endpoints (spec §3 safety rails) — `test:prod-ux` already enforces this at the journey level; the workflow only needs to supply `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` (J0a's deployment-freshness check) using this repo's existing secret names, unchanged from `curated-artifacts.yml`.
- `pnpm --filter @rune-langium/studio run type-check` and the relevant `vitest` file after every code task; this repo's CI matrix already gates the whole-package suite separately, so this plan does not duplicate a full-suite CI job.
- Run `pnpm --filter @rune-langium/studio test` (vitest) after every code task.

---

### Task 1: `timings.ts` — manifest-level budget roll-up + budget-aware `DEGRADED` verdict

**Files:**
- Create: `apps/studio/test/prod-ux/timings.ts`
- Create: `apps/studio/test/prod-ux/timings.test.ts`
- Modify: `apps/studio/test/prod-ux/evidence.ts` (`appendJourneyRecord`, manifest type)
- Modify: `apps/studio/test/prod-ux/fixtures.ts` (`checkout` fixture's verdict computation)

**Interfaces:**
- Consumes: `JourneyRecord` (type-only import from `./evidence.js` — the reverse import, `evidence.ts` importing `buildTimingsRollup`/`TimingRecord` from `./timings.js`, is a value import; since `timings.ts`'s import of `JourneyRecord` is `import type`, TypeScript/ESM elide it at emit time and there is no runtime circular dependency, only a type-level one).
- Produces: `TIMING_BUDGETS: Record<string, number>`, `TimingRecord { op: string; subject: string | null; ms: number; budgetMs: number }`, `buildTimingsRollup(journeys: readonly JourneyRecord[]): TimingRecord[]`, `exceedsBudget(opLog: readonly { op: string; durationMs?: number }[]): boolean` — all consumed by `evidence.ts` and `fixtures.ts` in this task, and by the `prod-ux-review` skill (reads the manifest JSON directly, no TS coupling).

- [ ] **Step 1: Write the failing test**

Create `apps/studio/test/prod-ux/timings.test.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { buildTimingsRollup, exceedsBudget } from './timings.js';
import type { JourneyRecord } from './evidence.js';

function makeRecord(overrides: Partial<JourneyRecord> & Pick<JourneyRecord, 'id' | 'title'>): JourneyRecord {
  return {
    verdict: 'PASS',
    durationMs: 1000,
    checkpoints: [],
    consoleErrors: [],
    failedRequests: [],
    softFindings: [],
    retry: 0,
    opLog: [],
    ...overrides
  };
}

describe('buildTimingsRollup', () => {
  it('extracts one timing entry per budgeted op with a recorded duration', () => {
    const journeys: JourneyRecord[] = [
      makeRecord({
        id: 'J03',
        title: 'J03 — Curated CDM load',
        opLog: [
          { op: 'cdmLoad', subject: 'CDM', level: 'success', message: 'loaded', durationMs: 12000, ts: 0, panel: 'output' }
        ]
      })
    ];
    expect(buildTimingsRollup(journeys)).toEqual([{ op: 'cdmLoad', subject: 'CDM', ms: 12000, budgetMs: 45000 }]);
  });

  it('omits opLog entries whose op has no known budget', () => {
    const journeys: JourneyRecord[] = [
      makeRecord({
        id: 'J07',
        title: 'J07 — Source view',
        opLog: [{ op: 'lspConnect', level: 'success', message: 'connected', durationMs: 300, ts: 0, panel: 'output' }]
      })
    ];
    expect(buildTimingsRollup(journeys)).toEqual([]);
  });

  it('omits entries with no recorded durationMs', () => {
    const journeys: JourneyRecord[] = [
      makeRecord({
        id: 'J03',
        title: 'J03',
        opLog: [{ op: 'cdmLoad', subject: 'CDM', level: 'info', message: 'starting', ts: 0, panel: 'output' }]
      })
    ];
    expect(buildTimingsRollup(journeys)).toEqual([]);
  });

  it('collects one entry per subject for repeatable ops across journeys', () => {
    const journeys: JourneyRecord[] = [
      makeRecord({
        id: 'J09',
        title: 'J09',
        opLog: [
          {
            op: 'formRender',
            subject: 'curated:Party',
            level: 'success',
            message: 'rendered',
            durationMs: 800,
            ts: 0,
            panel: 'output'
          },
          {
            op: 'formRender',
            subject: 'scratch:Widget',
            level: 'success',
            message: 'rendered',
            durationMs: 600,
            ts: 0,
            panel: 'output'
          }
        ]
      })
    ];
    expect(buildTimingsRollup(journeys)).toEqual([
      { op: 'formRender', subject: 'curated:Party', ms: 800, budgetMs: 5000 },
      { op: 'formRender', subject: 'scratch:Widget', ms: 600, budgetMs: 5000 }
    ]);
  });
});

describe('exceedsBudget', () => {
  it('returns false when every op is within budget', () => {
    expect(exceedsBudget([{ op: 'cdmLoad', durationMs: 12000 }])).toBe(false);
  });

  it('returns true when any op exceeds its budget', () => {
    expect(exceedsBudget([{ op: 'cdmLoad', durationMs: 50000 }])).toBe(true);
  });

  it('ignores unbudgeted ops and entries with no durationMs', () => {
    expect(
      exceedsBudget([
        { op: 'lspConnect', durationMs: 999999 },
        { op: 'cdmLoad' }
      ])
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/prod-ux/timings.test.ts`
Expected: FAIL with "Cannot find module './timings.js'" (or similar resolution error) — the module doesn't exist yet.

- [ ] **Step 3: Write `timings.ts`**

Create `apps/studio/test/prod-ux/timings.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { JourneyRecord } from './evidence.js';

/**
 * Soft wall-clock budgets per operation, copied verbatim from spec §4's
 * timings table. Exceeding a budget marks the journey DEGRADED, never
 * FAIL — only a journey's own hard assertions can fail it.
 */
export const TIMING_BUDGETS: Record<string, number> = {
  startPageInteractive: 5000,
  workspaceOpen: 5000,
  cdmLoad: 45000,
  hydration: 10000,
  typeClosureWalk: 60000,
  formRender: 5000,
  functionExecute: 10000,
  codegen: 15000,
  importPreview: 10000,
  importMerge: 10000,
  reloadRestore: 8000
};

export interface TimingRecord {
  op: string;
  subject: string | null;
  ms: number;
  budgetMs: number;
}

/**
 * Rolls every journey's opLog entries into one manifest-level timings table
 * (spec §4 shape). Only entries whose `op` has a known budget and a
 * recorded `durationMs` are included — unbudgeted or not-yet-instrumented
 * ops are silently omitted, matching spec §6's "the harness degrades
 * gracefully to test-side stopwatches without it."
 */
export function buildTimingsRollup(journeys: readonly JourneyRecord[]): TimingRecord[] {
  const timings: TimingRecord[] = [];
  for (const journey of journeys) {
    for (const entry of journey.opLog) {
      const budgetMs = TIMING_BUDGETS[entry.op];
      if (budgetMs === undefined || entry.durationMs === undefined) continue;
      timings.push({ op: entry.op, subject: entry.subject ?? null, ms: entry.durationMs, budgetMs });
    }
  }
  return timings;
}

/** True if any entry in a single journey's own opLog exceeded its op's budget. */
export function exceedsBudget(opLog: readonly { op: string; durationMs?: number }[]): boolean {
  return opLog.some((entry) => {
    const budgetMs = TIMING_BUDGETS[entry.op];
    return budgetMs !== undefined && entry.durationMs !== undefined && entry.durationMs > budgetMs;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/prod-ux/timings.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Wire the roll-up into the manifest writer**

Read `apps/studio/test/prod-ux/evidence.ts:174-200` (`appendJourneyRecord`) first — this step modifies it in place.

Add the import (near the top, alongside the existing `OpLogEntry` type import):

```ts
import { buildTimingsRollup, type TimingRecord } from './timings.js';
```

Replace the `appendJourneyRecord` function body:

```ts
export interface RunManifest {
  runId: string;
  journeys: JourneyRecord[];
  timings: TimingRecord[];
}

export async function appendJourneyRecord(record: JourneyRecord): Promise<void> {
  await mkdir(REPORT_DIR, { recursive: true });
  const manifestPath = path.join(REPORT_DIR, 'run-manifest.json');
  let manifest: RunManifest;
  try {
    const raw = await readFile(manifestPath, 'utf-8');
    manifest = JSON.parse(raw);
  } catch {
    manifest = { runId: `prod-ux-${new Date().toISOString()}`, journeys: [], timings: [] };
  }

  // A retry that supersedes a prior attempt for the same journey id must not
  // silently delete that prior attempt's evidence (e.g. a FAIL-then-PASS
  // flake) — fold it (and anything it already carried) into previousAttempts
  // on the surviving record, keeping ONE manifest entry per journey id.
  const existing = manifest.journeys.find((j) => j.id === record.id);
  const finalRecord: JourneyRecord = existing
    ? {
        ...record,
        previousAttempts: [...(existing.previousAttempts ?? []), withoutPreviousAttempts(existing)]
      }
    : record;

  manifest.journeys = manifest.journeys.filter((j) => j.id !== record.id);
  manifest.journeys.push(finalRecord);
  manifest.timings = buildTimingsRollup(manifest.journeys);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}
```

This is a pure additive change: the only new behavior is the `manifest.timings = buildTimingsRollup(manifest.journeys)` line and the now-named `RunManifest` interface (previously an inline anonymous type) — the retry-folding logic above it is unchanged.

- [ ] **Step 6: Wire budget-aware downgrade into the `checkout` fixture**

Read `apps/studio/test/prod-ux/fixtures.ts:36-48` first — this step modifies it in place.

Add the import (alongside the existing `EvidenceCollector`/`appendJourneyRecord` import):

```ts
import { exceedsBudget } from './timings.js';
```

Replace the `checkout` fixture body:

```ts
export const checkout = base.extend<CheckoutFixtures>({
  evidence: async ({ page }, use, testInfo) => {
    const subId = testInfo.annotations.find((a) => a.type === 'journey-subid')?.description;
    const journeyId = computeJourneyId(testInfo.title, subId);
    const collector = new EvidenceCollector(page, journeyId, testInfo.title, testInfo.retry);
    await use(collector);
    const baseVerdict = testInfo.status === testInfo.expectedStatus ? 'PASS' : 'FAIL';
    const opLog = await readOpLog(page);
    const degraded = collector.hasSoftFindings || exceedsBudget(opLog);
    const verdict = baseVerdict === 'PASS' && degraded ? 'DEGRADED' : baseVerdict;
    const record: JourneyRecord = await collector.finish(verdict, opLog);
    await appendJourneyRecord(record);
  }
});
```

The only change is moving the `readOpLog` call above the verdict computation (it was already happening, just after) and OR-ing `exceedsBudget(opLog)` into the same `degraded` check `hasSoftFindings` already drove.

- [ ] **Step 7: Update `fixtures.test.ts`'s local manifest-shape helper if needed, then run the full prod-ux vitest suite**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/prod-ux/`
Expected: PASS — `fixtures.test.ts`'s `readManifest()` helper types the manifest as `{ runId: string; journeys: JourneyRecord[] }`, which is structurally compatible with the now-wider `RunManifest` (an extra `timings` field on the real JSON does not break a narrower read-side type), so no edit should be required there; if `type-check` (Step 8) disagrees, widen `readManifest`'s return type to import and use `RunManifest` from `./evidence.js` instead of its local inline type.

- [ ] **Step 8: Type-check and full studio test run**

```bash
pnpm --filter @rune-langium/studio run type-check
pnpm --filter @rune-langium/studio exec vitest run
```

Expected: both clean.

- [ ] **Step 9: Commit**

```bash
git add apps/studio/test/prod-ux/timings.ts apps/studio/test/prod-ux/timings.test.ts apps/studio/test/prod-ux/evidence.ts apps/studio/test/prod-ux/fixtures.ts
git commit -m "feat(prod-ux): budget-aware timings roll-up (spec Phase 4)"
```

---

### Task 2: Nightly GitHub Actions workflow

**Files:**
- Create: `.github/workflows/prod-ux-nightly.yml`
- Modify: `docs/TESTING.md` (new subsection documenting the nightly run)

**Interfaces:**
- Consumes: `pnpm --filter @rune-langium/studio run test:prod-ux` (existing script, unchanged), `apps/studio/test/prod-ux/report/` (the evidence bundle directory Task 1's manifest and every journey's screenshots/traces already write into).
- Produces: a GitHub Actions artifact named `prod-ux-report`, uploaded on every run (pass, fail, or job-level `continue-on-error`) — Task 3's scheduled routine consumes this by name via `gh run download`.

- [ ] **Step 1: Write the workflow file**

Create `.github/workflows/prod-ux-nightly.yml`:

```yaml
name: Prod UX Nightly Checkout

# Runs the full production UX checkout harness (spec:
# docs/superpowers/specs/2026-07-16-prod-ux-checkout-harness.md) against the
# real deployed Studio nightly, and uploads the evidence bundle
# (run-manifest.json, screenshots, traces, axe results) as a build artifact.
# This workflow never fails the build on its own — a red/degraded journey is
# evidence for the nightly prod-ux-review routine to triage, not a CI gate
# (unlike ci.yml's PR-blocking studio-a11y job).
#
# Triggers:
#   - Nightly at 04:41 UTC (offset from curated-artifacts.yml's 04:00 UTC so
#     the two scheduled jobs don't contend for the same runner-minute window)
#   - Manual dispatch

on:
  schedule:
    - cron: '41 4 * * *'
  workflow_dispatch:

jobs:
  prod-ux-checkout:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v7

      - name: Install pnpm
        uses: pnpm/action-setup@v6
        with:
          version: 11.5.0

      - name: Use Node.js 22.x
        uses: actions/setup-node@v6
        with:
          node-version: '22.x'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Playwright browsers (chromium only)
        run: pnpm --filter @rune-langium/studio exec playwright install --with-deps chromium

      - name: Run prod-ux checkout harness
        continue-on-error: true
        run: pnpm --filter @rune-langium/studio run test:prod-ux
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

      - name: Upload evidence bundle
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: prod-ux-report
          path: apps/studio/test/prod-ux/report/
          retention-days: 14
          if-no-files-found: warn
```

- [ ] **Step 2: Validate the YAML parses**

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/prod-ux-nightly.yml'))" && echo OK
```

Expected: `OK` (this repo's CI images always carry a system Python 3 with PyYAML available via `actions/setup-python`'s runner image; if `yaml` isn't importable locally, `pnpm dlx js-yaml .github/workflows/prod-ux-nightly.yml >/dev/null && echo OK` is an equivalent Node-side check).

- [ ] **Step 3: Document the nightly run in `docs/TESTING.md`**

Read `docs/TESTING.md:34-59` first (the existing "Browser smoke checks" subsection) — insert a new subsection immediately after it, before "### Operational note":

```markdown
### Full checkout harness (`test:prod-ux`)

```bash
# Run the full 18-journey checkout harness against the default deploy.
pnpm --filter @rune-langium/studio run test:prod-ux

# Against a preview/staging deployment.
PLAYWRIGHT_BASE_URL=https://preview.example/rune-studio/studio/ pnpm --filter @rune-langium/studio run test:prod-ux
```

This is the superset harness (spec: `docs/superpowers/specs/2026-07-16-prod-ux-checkout-harness.md`)
that exercises every perspective, dialog, and mutation loop the smoke check
above does not. It writes an evidence bundle — `run-manifest.json`
(per-journey verdicts, opLog streams, budget-aware timings), screenshots,
traces, and axe results — to `apps/studio/test/prod-ux/report/`, meant to be
read by the `prod-ux-review` agent skill (`.agents/skills/prod-ux-review/`),
not by eye.

**Nightly automation:** `.github/workflows/prod-ux-nightly.yml` runs this on
a schedule (04:41 UTC) and uploads `report/` as the `prod-ux-report` build
artifact — this job never fails the build; a red journey is evidence, not a
gate. A separate scheduled Claude Code routine picks up the latest artifact
and runs the `prod-ux-review` skill against it (see that skill's `SKILL.md`
for the review procedure); it files a GitHub issue when it finds a genuine
regression, as distinct from a corpus-drift or known-issue finding.
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/prod-ux-nightly.yml docs/TESTING.md
git commit -m "ci(prod-ux): nightly checkout harness run + evidence artifact (spec Phase 4)"
```

---

### Task 3: Scheduled review-skill handoff

**Files:** none under version control by this task's own action (the routine itself is Claude Code account-level state, created via the `schedule` skill, not a repo file) — this task's only repo-visible trace is the `docs/TESTING.md` paragraph already added in Task 2 Step 3, which documents the routine's existence for an engineer with no session context.

**Interfaces:**
- Consumes: the `prod-ux-report` GitHub Actions artifact Task 2 produces (via `gh run list`/`gh run download` against `pradeepmouli/rune-langium`), the `prod-ux-review` skill (`.agents/skills/prod-ux-review/SKILL.md`, already in the repo, unmodified by this task).
- Produces: a nightly-triggered Claude Code routine execution; a GitHub issue (via `gh issue create`) when the review skill's triage finds a **regression**-classified finding (per that skill's own classification: regression / corpus-drift / known-issue).

- [ ] **Step 1: Confirm the latest nightly artifact is fetchable before wiring the routine**

Trigger the Task 2 workflow manually once (its first scheduled 04:41 UTC run may be up to 24h away) and confirm an artifact lands:

```bash
gh workflow run prod-ux-nightly.yml --repo pradeepmouli/rune-langium
```

Poll until the run completes (`gh run list --repo pradeepmouli/rune-langium --workflow=prod-ux-nightly.yml --limit 1`), then confirm the artifact exists:

```bash
gh run list --repo pradeepmouli/rune-langium --workflow=prod-ux-nightly.yml --limit 1 --json databaseId,status,conclusion
gh api repos/pradeepmouli/rune-langium/actions/runs/<run-id>/artifacts --jq '.artifacts[].name'
```

Expected: `prod-ux-report` in the artifact name list. If the run fails before the upload step (e.g. `pnpm install` failure unrelated to this plan), fix that first — the routine in the next step is only as good as this artifact existing.

- [ ] **Step 2: Create the persistent nightly routine**

Invoke the `schedule` skill (not `CronCreate` — that tool is session-scoped and auto-expires in 7 days; this routine must run indefinitely) with a cron offset after Task 2's workflow typically finishes (the harness budget is "< 20 min" per spec §8, so 40 minutes of headroom after the 04:41 UTC trigger is generous):

- Cron: `30 5 * * *` (05:30 UTC daily)
- Prompt for the routine (verbatim, so it is self-contained on every fire):

```
Download the latest `prod-ux-report` artifact from the most recent completed
run of `.github/workflows/prod-ux-nightly.yml` in `pradeepmouli/rune-langium`
(`gh run list --repo pradeepmouli/rune-langium --workflow=prod-ux-nightly.yml
--limit 1 --json databaseId,conclusion` to find it, then `gh run download
<id> --repo pradeepmouli/rune-langium --name prod-ux-report --dir
<scratch-dir>`). If no run has completed in the last 48 hours, stop and
report that instead of reviewing stale data.

Invoke the prod-ux-review skill against the downloaded report/ directory
(read `.agents/skills/prod-ux-review/SKILL.md` in the
pradeepmouli/rune-langium checkout for the review procedure if the skill
isn't directly invocable in this context).

If the review's output classifies ANY finding as a genuine regression
(not corpus-drift, not an already-known-issue-ledger entry), open a GitHub
issue via `gh issue create --repo pradeepmouli/rune-langium` summarizing it
— title prefixed `[prod-ux-nightly]`, body includes the journey id, the
verdict, and the specific assertion/timing that failed. If an open issue
with the same `[prod-ux-nightly]` title prefix already covers the same
journey+finding, comment on it instead of opening a duplicate
(`gh issue list --repo pradeepmouli/rune-langium --search
"[prod-ux-nightly] in:title"` to check first).

If everything is PASS/DEGRADED-by-known-issue only, do not open or comment
on any issue — a quiet night needs no action.
```

- [ ] **Step 3: Verify the routine was registered**

Use the `schedule` skill's list/status capability to confirm the routine appears with the correct cron and prompt. Record its identifier in this plan's tracking (e.g. as a note in the PR description when this branch is finished) so it can be found and edited later without re-deriving this task.

- [ ] **Step 4: Commit the `docs/TESTING.md` update from Task 2 if not already committed**

(No new files this task produces under version control; if Task 2's commit already included the `docs/TESTING.md` paragraph, this step is a no-op — confirm with `git log --oneline -- docs/TESTING.md`.)

---

### Task 4: Phase 4 close-out — full run + manifest review

Mirrors Phase 2's and Phase 3's Task 6, which each found additional genuine cross-task bugs during a full production run that no single task-scoped review caught.

**Files:**
- Modify: whichever files a genuine finding requires (cannot be predicted in advance — this task's job is discovery, same as every prior phase's close-out task).

**Interfaces:**
- Consumes: all of Tasks 1–3's output.
- Produces: nothing — this is the Phase 4 terminal task.

- [ ] **Step 1: Type-check and full studio test run**

```bash
pnpm --filter @rune-langium/studio run type-check
pnpm --filter @rune-langium/studio exec vitest run
```

- [ ] **Step 2: Run the full J0–J18 suite locally against real production**

```bash
PLAYWRIGHT_PROD_SMOKE=1 pnpm --filter @rune-langium/studio exec playwright test test/prod-ux/journeys/ --config=playwright.prod.config.ts
```

- [ ] **Step 3: Read the resulting `run-manifest.json` end to end**

Confirm: every journey record now embeds a plausible `opLog`; the new top-level `manifest.timings` array is present and non-empty (at minimum `cdmLoad`, `formRender`, `functionExecute` entries, per the journeys already known to call `opLog`-producing code per this plan's Task 1 research); no journey is unexpectedly `DEGRADED` solely from a budget miss that looks like a real perf regression rather than noise (if one is, investigate before treating this task as done — a budget-driven `DEGRADED` is new behavior this phase introduces, so its first appearance deserves a look, not a rubber stamp).

- [ ] **Step 4: Confirm the nightly workflow and routine both fire cleanly end to end**

Re-run Task 3 Step 1's manual `gh workflow run` once more now that Task 1's code changes are live, and confirm `manifest.timings` appears in the freshly uploaded artifact's `run-manifest.json` (download it via `gh run download` and inspect, same as Task 3 Step 1). Confirm the routine created in Task 3 Step 2 is still listed via the `schedule` skill.

- [ ] **Step 5: Commit any close-out fixes, then dispatch the final whole-branch review**

Follow subagent-driven-development's process before moving to `finishing-a-development-branch`, matching every prior phase.
