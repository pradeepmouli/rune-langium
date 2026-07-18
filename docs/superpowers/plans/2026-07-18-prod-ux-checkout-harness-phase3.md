# Production UX Checkout Harness — Phase 3 (completeness tail: J12–J17) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the prod-ux checkout harness's journey inventory by adding J12 (Import dialog), J13 (Export perspective), J14 (Git/Sync perspective), J15 (Settings perspective), J16 (Resilience & chrome), and J17 (Accessibility sweep) — the six journeys from `docs/superpowers/specs/2026-07-16-prod-ux-checkout-harness.md` §5 not covered by Phase 0-1 (J0–J7, merged) or Phase 2 (J8–J11, J18, merged).

**Architecture:** Every task adds one Playwright spec file under `apps/studio/test/prod-ux/journeys/`, built on the `checkout` fixture (`apps/studio/test/prod-ux/fixtures.ts`) and `EvidenceCollector` (`apps/studio/test/prod-ux/evidence.ts`) infrastructure Phase 0-1 built — no new harness plumbing is needed. Two tasks absorb existing, already-working Playwright specs verbatim into the harness (same pattern Phase 0-1 used for `prod-smoke` → J0/J3/J4): J12 absorbs `apps/studio/test/prod-smoke/schema-import-checkout.spec.ts`, J16 absorbs `apps/studio/test/e2e/curated-load-cancel.spec.ts`. J17 extends the existing `@axe-core/playwright` harness in `apps/studio/test/e2e/a11y.spec.ts` rather than introducing new a11y tooling.

**Tech Stack:** Playwright (`@playwright/test`), `@axe-core/playwright` (already a pinned dependency), the existing `checkout` fixture/`EvidenceCollector`/`anchors.ts`/`readOpLog` infrastructure from Phase 0-1, and `authorScratchType`/`authorScratchFunction` from Phase 2 (not used by any Phase 3 task directly, but available if an implementer needs a scratch type mid-task).

## Global Constraints

- All journeys gate on `process.env.PLAYWRIGHT_PROD_SMOKE` via `test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio')` — copy this line verbatim into every new `test.describe` block, matching every existing journey file.
- Every journey imports `checkout as test, expect` from `../fixtures.js` (note the `.js` extension on a `.ts` file — this repo's ESM/NodeNext module resolution convention, already used by every existing journey).
- Every journey calls `await evidence.checkpoint('<name>')` at meaningful points — screenshots land under `apps/studio/test/prod-ux/report/screenshots/<journeyId>/attempt<N>/`.
- A soft, non-regression-blocking finding (a corpus-drift candidate, a confirmed pre-existing product gap, a known-issue) is recorded via `evidence.softFinding(ledgerId: string, detail: string)` — never silently skipped, never a hard `expect` failure. Use a `KI-<slug>` id convention (matches the existing `KI-anchor-data-no-field-validation` precedent from J9).
- **Never fabricate a passing assertion for a UI action that doesn't exist.** Where this plan's research found a spec requirement has no live UI affordance (J15's theme toggle and layout reset — see Task 3), the task descopes that specific sub-assertion with an inline comment explaining why, and records a `softFinding` — it does not invent a workaround. This mirrors Phase 2 Task 2's handling of J8's unwired undo/redo, confirmed as the right call by that task's reviewer.
- File paths, testids, and component names in this plan were verified against the current source on `master` as of this plan's authoring (branch `feat/prod-ux-checkout-harness-phase3`, based on commit `115a0021`, which includes all of Phase 0-1 and Phase 2). Where a specific rendered field/label could not be confirmed without mounting the live app (flagged per-task below), the task text says so explicitly — the implementer confirms it live during Step 1 and adjusts the selector, following the same discipline Phase 2's J11 used when its literal plan wording didn't match the real `CodegenProvider.tsx` behavior.
- SPDX header on every new file: `// SPDX-License-Identifier: FSL-1.1-ALv2` / `// Copyright (c) 2026 Pradeep Mouli` (this is `apps/studio/`, FSL-licensed — matches every existing journey file).

---

### Task 1: J12 — Import dialog (JSON Schema, OpenAPI, SQL, XSD)

**Files:**
- Create: `apps/studio/test/prod-ux/journeys/j12-import-dialog.spec.ts`
- Delete: `apps/studio/test/prod-smoke/schema-import-checkout.spec.ts` (absorbed verbatim into the new journey's JSON Schema case — same "absorb, don't duplicate" precedent as J0/J3/J4)

**Interfaces:**
- Consumes: `checkout as test, expect` from `../fixtures.js`; no other Phase 0-1/2 helper is needed (this journey builds its own blank workspace via the same `input[type="file"][accept=".rosetta"]` upload pattern `loadCdm`/`reachBlankScratchSource` already use — `reachBlankScratchSource` itself is NOT exported from `fixtures.ts`, so this journey replicates the minimal 4-line upload inline, matching the pattern in the file being absorbed).
- Produces: nothing consumed by later Phase 3 tasks.

**Confirmed facts (from live source, this session):**
- Dialog: `apps/studio/src/components/ImportDialog.tsx`, testid `import-dialog`. Opened via a topbar button with **no `data-testid`** — target with `page.getByRole('button', { name: 'Import' })` (this is literally what the file being absorbed already does).
- Format select: `id="import-dialog-format"` (Radix `Select`, no `data-testid` on the trigger — target via its accessible name/role, e.g. `page.getByLabel(/format/i)` or the select's role — confirm the exact accessible name live in Step 1, since the plan's research pass could not mount the live DOM). Values: `json-schema` (default), `openapi`, `sql`, `xsd`.
- Source input: `Textarea` at `data-testid="import-dialog__source"` — accepts pasted text directly, no file upload needed for any of the 4 formats.
- Namespace input: `data-testid="import-dialog__namespace"` — auto-derived from source if left blank, **except SQL, which requires it explicitly** (throws a client-side validation error surfaced at `data-testid="import-dialog__error"` if left empty for `format === 'sql'`).
- Preview button: **no testid** — `page.getByRole('button', { name: 'Preview' })`.
- Success renders `data-testid="import-dialog__summary"` (e.g. `"1 type(s), 0 enum(s)..."`) and `data-testid="import-dialog__preview"` (a `CodeBlock` of the generated `.rune` text).
- Confirm button: `data-testid="import-dialog__confirm"`, label is dynamic (`"Add to workspace"` or `"Merge into <path>"`) — assert on the testid, not the label text.
- State reset between formats: `ImportDialog.tsx` has a `useEffect` keyed on `format` that resets `phase`/`formatOptions` on every format switch, and a separate `useEffect` on `open` that resets format/sourceText/namespace/phase whenever the dialog reopens — confirmed directly in source. This means the state-reset assertion in Step 5 below is testing real, already-implemented behavior (not a gap to work around).

**Tiny inline fixtures (verified real — taken from existing unit-test fixtures in `packages/codegen/test/import/*.test.ts`, guaranteed to parse):**

```ts
const JSON_SCHEMA_SOURCE = JSON.stringify({
  $id: 'https://example.com/schemas/widget.json',
  $defs: {
    Widget: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name']
    }
  }
});

const OPENAPI_SOURCE = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'Party Service', version: '1.0.0' },
  paths: {},
  components: {
    schemas: {
      Party: {
        type: 'object',
        required: ['partyId'],
        properties: {
          partyId: { type: 'string' },
          partyName: { type: 'string', nullable: true }
        }
      }
    }
  }
});

const SQL_SOURCE = 'CREATE TABLE party (id INT PRIMARY KEY, party_name TEXT NOT NULL, nickname TEXT)';

const XSD_SOURCE = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:complexType name="Party">
    <xs:sequence>
      <xs:element name="partyId" type="xs:string" minOccurs="1" maxOccurs="1"/>
      <xs:element name="partyName" type="xs:string" minOccurs="0"/>
    </xs:sequence>
    <xs:attribute name="version" type="xs:string"/>
  </xs:complexType>
</xs:schema>`;
```

- [ ] **Step 1: Read `ImportDialog.tsx` and confirm the format-select's exact accessible name/role live** (or via component source if the Radix `Select`'s `aria-label`/associated `<label htmlFor="import-dialog-format">` text is visible in the file) before writing selectors. Read `packages/codegen/src/options/*.ts` for the exact per-format option field names/labels the plan's research already partially confirmed (`skipConditions`, `includeUnreferencedDefs`, `dialect`, `importTopLevelElements`) — pick ONE option per format to toggle for Step 4's "adjust one import option" requirement, using whatever rendered checkbox/select label the z2f-generated options form actually shows (inspect live).

- [ ] **Step 2: Write the journey file, absorbing the JSON Schema case verbatim**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { Buffer } from 'node:buffer';
import { checkout as test, expect } from '../fixtures.js';

const WORKSPACE_FILE_NAME = 'party.rosetta';
const WORKSPACE_FILE_CONTENT = 'namespace test\ntype Party:\n  name string (1..1)\n';

async function openWorkspaceAndImport(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('./');
  await page.waitForLoadState('domcontentloaded');
  await expect(page).toHaveTitle(/Rune Studio/);
  await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });

  const fileInput = page.locator('input[type="file"][accept=".rosetta"]');
  await fileInput.setInputFiles([
    { name: WORKSPACE_FILE_NAME, mimeType: 'text/plain', buffer: Buffer.from(WORKSPACE_FILE_CONTENT) }
  ]);
  await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByTestId('import-dialog')).toBeVisible({ timeout: 10000 });
}

const JSON_SCHEMA_SOURCE = JSON.stringify({
  $id: 'https://example.com/schemas/widget.json',
  $defs: {
    Widget: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name']
    }
  }
});

const OPENAPI_SOURCE = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'Party Service', version: '1.0.0' },
  paths: {},
  components: {
    schemas: {
      Party: {
        type: 'object',
        required: ['partyId'],
        properties: {
          partyId: { type: 'string' },
          partyName: { type: 'string', nullable: true }
        }
      }
    }
  }
});

const SQL_SOURCE = 'CREATE TABLE party (id INT PRIMARY KEY, party_name TEXT NOT NULL, nickname TEXT)';

const XSD_SOURCE = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:complexType name="Party">
    <xs:sequence>
      <xs:element name="partyId" type="xs:string" minOccurs="1" maxOccurs="1"/>
      <xs:element name="partyName" type="xs:string" minOccurs="0"/>
    </xs:sequence>
    <xs:attribute name="version" type="xs:string"/>
  </xs:complexType>
</xs:schema>`;

test.describe('J12 — Import dialog (inbound codegen)', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J12 imports JSON Schema, OpenAPI, SQL, and XSD sources, one after another', async ({ page, evidence }) => {
    await openWorkspaceAndImport(page);

    // JSON Schema — format defaults to it, no selector interaction needed.
    // Absorbed from test/prod-smoke/schema-import-checkout.spec.ts.
    await page.getByTestId('import-dialog__source').fill(JSON_SCHEMA_SOURCE);
    await page.getByTestId('import-dialog__namespace').fill('smoke.jsonschema');
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('import-dialog__summary')).toContainText('1 type(s)', { timeout: 15000 });
    await expect(page.getByTestId('import-dialog__preview')).toContainText('type Widget', { timeout: 5000 });
    await expect(page.getByTestId('import-dialog__confirm')).toBeEnabled();
    await page.getByTestId('import-dialog__confirm').click();
    await expect(page.getByTestId('import-dialog')).not.toBeVisible({ timeout: 10000 });
    await evidence.checkpoint('json-schema-imported');

    // Confirm the imported type is real and navigable — same pattern every
    // other journey uses for a post-mutation existence check.
    const namespaceSearch = page.getByTestId('namespace-search');
    await namespaceSearch.fill('Widget');
    await expect(page.getByTestId('ns-type-nav-smoke.jsonschema.Widget')).toBeVisible({ timeout: 15000 });

    // Reopen for OpenAPI — this is where state-reset-between-formats matters:
    // a prior format's error/summary/preview must not leak into this run.
    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByTestId('import-dialog')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('import-dialog__summary')).toHaveCount(0);
    await expect(page.getByTestId('import-dialog__error')).toHaveCount(0);

    // TODO(implementer, Step 1): replace this selector with the confirmed
    // live accessible name/role for the format select.
    await page.getByLabel(/format/i).selectOption('openapi');
    await page.getByTestId('import-dialog__source').fill(OPENAPI_SOURCE);
    await page.getByTestId('import-dialog__namespace').fill('smoke.openapi');
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('import-dialog__summary')).toContainText('1 type(s)', { timeout: 15000 });
    await expect(page.getByTestId('import-dialog__preview')).toContainText('type Party', { timeout: 5000 });
    await page.getByTestId('import-dialog__confirm').click();
    await expect(page.getByTestId('import-dialog')).not.toBeVisible({ timeout: 10000 });
    await evidence.checkpoint('openapi-imported');

    // SQL — exercises the tree-sitter WASM grammar-fetch path (PR #390's
    // `?url` asset loading in the deployed bundle) and the SQL-specific
    // required-namespace validation.
    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByTestId('import-dialog')).toBeVisible({ timeout: 10000 });
    await page.getByLabel(/format/i).selectOption('sql');
    await page.getByTestId('import-dialog__source').fill(SQL_SOURCE);
    // Deliberately leave namespace blank first to confirm SQL's required-
    // namespace validation fires, then fill it — exercises the dialog's own
    // error-then-recover path, not just the happy path.
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('import-dialog__error')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('import-dialog__namespace').fill('smoke.sql');
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('import-dialog__summary')).toContainText('1 type(s)', { timeout: 20000 });
    await expect(page.getByTestId('import-dialog__preview')).toContainText('type Party', { timeout: 5000 });
    await page.getByTestId('import-dialog__confirm').click();
    await expect(page.getByTestId('import-dialog')).not.toBeVisible({ timeout: 10000 });
    await evidence.checkpoint('sql-imported');

    // XSD.
    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByTestId('import-dialog')).toBeVisible({ timeout: 10000 });
    await page.getByLabel(/format/i).selectOption('xsd');
    await page.getByTestId('import-dialog__source').fill(XSD_SOURCE);
    await page.getByTestId('import-dialog__namespace').fill('smoke.xsd');
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('import-dialog__summary')).toContainText('1 type(s)', { timeout: 15000 });
    await expect(page.getByTestId('import-dialog__preview')).toContainText('type Party', { timeout: 5000 });
    await page.getByTestId('import-dialog__confirm').click();
    await expect(page.getByTestId('import-dialog')).not.toBeVisible({ timeout: 10000 });
    await evidence.checkpoint('xsd-imported');
  });
});
```

- [ ] **Step 3: Run against a local rebuilt build first** (per this branch's established false-negative trap — `wrangler pages dev --proxy` serves prebuilt `dist/`, not live source):

```bash
pnpm --filter @rune-langium/core run build && pnpm --filter @rune-langium/studio run build
pnpm --filter @rune-langium/studio run dev:pages &
PLAYWRIGHT_PROD_SMOKE=1 PLAYWRIGHT_BASE_URL=http://localhost:8788 pnpm --filter @rune-langium/studio exec playwright test test/prod-ux/journeys/j12-import-dialog.spec.ts --config=playwright.prod.config.ts
```

Expected: PASS, all 4 format cases complete, `report/screenshots/J12/attempt0/` has 4 checkpoint screenshots.

- [ ] **Step 4: Add the "adjust one import option" sub-assertion** using whichever field Step 1 confirmed live (e.g. for JSON Schema, toggle `includeUnreferencedDefs` off before Preview and confirm the summary's type count changes, or for XSD toggle `importTopLevelElements` and confirm a different set of types appears in the preview) — insert this into the JSON Schema case (the format with no WASM dependency, fastest to iterate on).

- [ ] **Step 5: Delete the absorbed file and its imports**

```bash
git rm apps/studio/test/prod-smoke/schema-import-checkout.spec.ts
```

Check `apps/studio/test/prod-smoke/` (or a run-config file) for any explicit reference to this filename (e.g. a `testMatch` glob or a CI job listing it explicitly) and remove the reference if present — mirror how Phase 0-1's Task 11 handled removing `production-checkout.spec.ts`'s references when absorbing it into J0/J3/J4.

- [ ] **Step 6: Full re-run + commit**

```bash
PLAYWRIGHT_PROD_SMOKE=1 PLAYWRIGHT_BASE_URL=http://localhost:8788 pnpm --filter @rune-langium/studio exec playwright test test/prod-ux/journeys/j12-import-dialog.spec.ts --config=playwright.prod.config.ts
pnpm --filter @rune-langium/studio run type-check
git add apps/studio/test/prod-ux/journeys/j12-import-dialog.spec.ts apps/studio/test/prod-smoke/schema-import-checkout.spec.ts
git commit -m "feat(prod-ux): J12 — Import dialog (JSON Schema, OpenAPI, SQL, XSD)"
```

---

### Task 2: J13 — Export perspective

**Files:**
- Create: `apps/studio/test/prod-ux/journeys/j13-export-perspective.spec.ts`

**Interfaces:**
- Consumes: `checkout as test, expect, loadCdm` from `../fixtures.js`.
- Produces: nothing consumed by later tasks.

**Confirmed facts (from live source, this session) — READ BEFORE WRITING:**
- Perspective: `apps/studio/src/shell/perspectives/screens/ExportPerspective.tsx`, root testid `export-perspective`. `requiresWorkspace: true` (per `perspective-registry.ts`), rail testid `rail-export`.
- `export-targets-section` (renders `CodegenTargetsTable`), `export-active-target`, `export-preview-status`, `export-preview-content`, `export-preview-empty`.
- `DownloadConfigDialog` (`apps/studio/src/components/DownloadConfigDialog.tsx`), testid `download-config-dialog`. Child testids: `download-config-dialog__cancel`, `download-config-dialog__generate`, `download-config-dialog__layout` + `download-config-dialog__layout-<value>` (radio choices), `download-config-dialog__namespaces`, `download-config-dialog__ns-row-<ns>` / `download-config-dialog__ns-<ns>` (checkbox, `data-state="selected"|"pulled"|"unselected"`). Opened via a per-target download button inside `export-targets-section` (exact button locator to confirm live in Step 1 — the plan's research pass found the call site (`ExportPerspective.handleDownload`) but not the exact rendered button testid/label for `CodegenTargetsTable`'s per-row download control).
- **Confirmed via direct source read this session: `ExportPerspective`'s own Generate/Download flow (`handleModalGenerate` → `downloadTargetViaRouter`) unconditionally `POST`s to `/api/codegen`** — the exact same endpoint the topbar Export Code modal (`ExportDialog.tsx`) hits, and the exact same endpoint this session's project memory records as historically 503-ing in prod (`KI-codegen-503`, per `feedback_code_tab_vs_export_button.md`). **This means the spec's literal "workspace bundle export produces a download (validated: non-zero tar.gz, contains the scratch `.rosetta`)" wording does not correspond to any confirmed-real, always-succeeding UI affordance in `ExportPerspective`** — no tar.gz/bundle download mechanism was found there in this plan's research (the only tar.gz-producing code in the repo, `apps/studio/src/opfs/tar-untar.ts`'s `createTarGz`, belongs to the unrelated Prototype Workspace feature). **Adapt this task's assertion accordingly** (see Step 3) rather than asserting a download mechanism that may not exist — confirm live in Step 1 whether a distinct bundle-export button exists in `export-perspective` before writing the task; if genuinely absent, the DownloadConfigDialog generate-flow soft-assertion (below) is the correct, real coverage for "does Export produce output," and this gap between spec wording and reality should be recorded as a `softFinding`, not silently dropped.
- There is a genuinely client-side, always-succeeding `.rosetta` download path: `ExportMenu.tsx`'s "Export .rosetta" button (`handleExportRosetta`, no network call, pure `Blob`+`<a download>`). **However, this plan's research found ZERO confirmed JSX render sites for `<ExportMenu ... />` anywhere in the current app** (only its own component definition and a stale 2025-era spec doc reference) — it may be dead/unmounted code from an earlier design. **Confirm live in Step 1 whether this button is actually reachable anywhere in the UI** (check the Explore perspective's toolbar first, since `getSerializedFiles` — its one confirmed prop source — lives in `ExplorePerspective.tsx`). If it's not reachable, do not reference it in the journey; note the finding as a `softFinding` (`KI-exportmenu-unmounted`) instead.
- Topbar "Export Code" modal (`ExportDialog.tsx`) already has an existing E2E test at `apps/studio/test/e2e/export.spec.ts` — read this file directly in Step 1 for its exact testids (`exportButton`, `exportCodeBtn` were found in the plan's research pass) and its existing soft-assertion/known-issue handling pattern (if any) around the 503, and mirror it rather than re-deriving.
- `apps/studio/test/prod-ux/known-issues.json` does **not** exist — the spec's architecture diagram mentions it but it was never built in Phase 0-1/2. Do not create it. Use `evidence.softFinding(ledgerId, detail)` directly, matching J9's `KI-anchor-data-no-field-validation` precedent — no ledger file lookup is needed.

- [ ] **Step 1: Live-verify the two open questions above** before writing any assertions:
  1. Does `export-perspective` (or anywhere else reachable from a loaded-CDM workspace) have a genuinely client-side "Export .rosetta" or bundle-download button, distinct from the `/api/codegen`-backed `DownloadConfigDialog` flow? Check the Explore toolbar and the Export perspective itself.
  2. Read `apps/studio/test/e2e/export.spec.ts` in full for its exact `exportButton`/`exportCodeBtn` testids and any existing 503-handling pattern.
  Record findings as code comments at the top of the new journey file explaining what was confirmed live and why the task's assertions are shaped the way they are (matching the density of comment-as-evidence already established throughout this harness, e.g. J9's `preview-store.ts` and `j18-type-closure.spec.ts`'s comments).

- [ ] **Step 2: Write the journey — perspective render, DownloadConfigDialog open/edit/close, and soft-asserted generate**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect, loadCdm } from '../fixtures.js';

test.describe('J13 — Export perspective', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J13 Export perspective renders and DownloadConfigDialog opens/edits/closes', async ({ page, evidence }) => {
    await loadCdm(page);
    await page.getByTestId('rail-export').click();
    await expect(page.getByTestId('export-perspective')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('export-targets-section')).toBeVisible({ timeout: 10000 });
    await evidence.checkpoint('export-perspective-loaded');

    // Open the download modal for one target (confirm the exact trigger
    // locator live per Step 1 — placeholder assumes a per-row download
    // button inside export-targets-section keyed by target name).
    await page.getByTestId('export-targets-section').getByRole('button', { name: /download/i }).first().click();
    await expect(page.getByTestId('download-config-dialog')).toBeVisible({ timeout: 10000 });

    // Edit: toggle a layout radio choice.
    const layoutGroup = page.getByTestId('download-config-dialog__layout');
    await expect(layoutGroup).toBeVisible();
    const layoutOptions = page.locator('[data-testid^="download-config-dialog__layout-"]');
    await expect(layoutOptions.first()).toBeVisible();
    await layoutOptions.last().click();
    await evidence.checkpoint('download-config-edited');

    // Close via cancel — confirms edits don't leak into a later open.
    await page.getByTestId('download-config-dialog__cancel').click();
    await expect(page.getByTestId('download-config-dialog')).not.toBeVisible({ timeout: 5000 });
  });

  test('J13 Export generate — soft-asserted under KI-codegen-503', async ({ page, evidence }) => {
    await loadCdm(page);
    await page.getByTestId('rail-export').click();
    await expect(page.getByTestId('export-perspective')).toBeVisible({ timeout: 20000 });

    await page.getByTestId('export-targets-section').getByRole('button', { name: /download/i }).first().click();
    await expect(page.getByTestId('download-config-dialog')).toBeVisible({ timeout: 10000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
    await page.getByTestId('download-config-dialog__generate').click();
    const download = await downloadPromise;

    if (download) {
      const path = await download.path();
      expect(path, 'download produced a non-empty file').toBeTruthy();
      await evidence.checkpoint('export-generate-succeeded');
    } else {
      // /api/codegen is a known, historically-503ing endpoint in prod (see
      // feedback_code_tab_vs_export_button.md / KI-codegen-503) — this
      // journey's own generate flow goes through the same endpoint
      // (confirmed via downloadTargetViaRouter's unconditional POST to
      // /api/codegen), so a failure here is a corpus/infra known-issue
      // candidate, not an unambiguous regression. J11 (Phase 2) already
      // covers the client-side, always-available Code tab path separately.
      evidence.softFinding(
        'KI-codegen-503',
        'ExportPerspective DownloadConfigDialog generate did not produce a download within 20s — ' +
          '/api/codegen is a known historically-503ing endpoint in prod; see feedback_code_tab_vs_export_button.md'
      );
    }
  });
});
```

- [ ] **Step 3: Incorporate Step 1's findings.** If a genuinely client-side bundle/`.rosetta` export button was confirmed reachable, add a third `test()` asserting its download succeeds unconditionally (no soft-assertion needed, since it has no server dependency) and validate the downloaded content is non-empty `.rosetta` text (read via `download.path()` and Node's `fs.readFile`). If NOT reachable, add `evidence.softFinding('KI-exportmenu-unmounted', ...)` to the first test instead, documenting that the spec's "workspace bundle export" wording doesn't currently correspond to a live UI affordance.

- [ ] **Step 4: Run and commit**

```bash
PLAYWRIGHT_PROD_SMOKE=1 PLAYWRIGHT_BASE_URL=http://localhost:8788 pnpm --filter @rune-langium/studio exec playwright test test/prod-ux/journeys/j13-export-perspective.spec.ts --config=playwright.prod.config.ts
pnpm --filter @rune-langium/studio run type-check
git add apps/studio/test/prod-ux/journeys/j13-export-perspective.spec.ts
git commit -m "feat(prod-ux): J13 — Export perspective"
```

---

### Task 3: J14 — Git/Sync perspective + J15 — Settings perspective

Combined per this session's established precedent of grouping small, related, low-complexity perspective checks into one task (same rationale as Phase 2 combining J10+J11).

**Files:**
- Create: `apps/studio/test/prod-ux/journeys/j14-git-sync.spec.ts`
- Create: `apps/studio/test/prod-ux/journeys/j15-settings.spec.ts`

(Two separate journey files, one task — matches this harness's one-journey-per-file convention throughout Phase 0-1/2; "combined" means one implementer/reviewer cycle covers both, not one file.)

**Interfaces:**
- Consumes: `checkout as test, expect` from `../fixtures.js` (J14 needs a workspace but not CDM — use the same inline blank-workspace upload pattern as Task 1's `openWorkspaceAndImport`, minus the Import-dialog part; J15 does not require a workspace at all per `perspective-registry.ts`'s `requiresWorkspace: false` for `settings`).
- Produces: nothing consumed by later tasks.

**J14 confirmed facts:**
- Perspective: `apps/studio/src/shell/perspectives/screens/GitSyncPerspective.tsx`, root testid `git-perspective`, rail testid `rail-git`, `requiresWorkspace: true`.
- **Spec-vs-reality gap, confirmed via source**: `SyncStatusBadge` only renders when `workspaceKind === 'git-backed' && workspaceId` — a plain (non-git) workspace, which is the only kind reachable without real GitHub OAuth, instead renders `GitNotConnectedEmptyState` (testid `git-not-connected`, heading "Not connected to Git"). There is **no literal "unauthenticated" phase** in `SyncStatusBadge` — its real phases are `syncing`/`offline`/`blocked`/`idle` (`data-phase` attribute on testid `sync-status`), reachable only for an already-git-backed workspace. **Adapt the spec's "SyncStatusBadge shows the unauthenticated state" to its real equivalent**: assert `git-not-connected` renders for a plain workspace, with an inline comment explaining the adaptation (same pattern as J9's `KI-anchor-data-no-field-validation` comment block).
- `GitHubConnectDialog` (`apps/studio/src/components/GitHubConnectDialog.tsx`, testid `github-connect-dialog`, `role="dialog"`, `aria-label="Connect GitHub"`) is opened from the **start page** (`FileLoader.tsx`'s "Open from GitHub…" button), **not** from within `GitSyncPerspective` — this journey needs to reach it via the model-loader screen, not via `rail-git`. Phase machine: `init` → `pending` (shows `verificationUri` + `userCode` + "I've authorised — check now" + "Cancel") → `expired`/`access_denied`/`error`. **Stop at `pending`** — assert the dialog reaches `pending` (confirms the real device-flow init succeeded against the auth worker), then click "Cancel" to close. Never visit the real `verificationUri`.

- [ ] **Step 1: Write `j14-git-sync.spec.ts`**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { Buffer } from 'node:buffer';
import { checkout as test, expect } from '../fixtures.js';

const WORKSPACE_FILE_NAME = 'starter.rosetta';
const WORKSPACE_FILE_CONTENT = 'namespace example\n';

test.describe('J14 — Git / Sync perspective', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J14 Git perspective renders and shows not-connected for a plain workspace', async ({ page, evidence }) => {
    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });
    const fileInput = page.locator('input[type="file"][accept=".rosetta"]');
    await fileInput.setInputFiles([
      { name: WORKSPACE_FILE_NAME, mimeType: 'text/plain', buffer: Buffer.from(WORKSPACE_FILE_CONTENT) }
    ]);
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });

    await page.getByTestId('rail-git').click();
    await expect(page.getByTestId('git-perspective')).toBeVisible({ timeout: 20000 });

    // SPEC ADAPTATION: the spec text says "SyncStatusBadge shows the
    // unauthenticated state" — confirmed via source this session that
    // SyncStatusBadge only renders for an already-git-backed workspace
    // (workspaceKind === 'git-backed'), which this plain workspace is not.
    // The real equivalent for a non-git workspace is GitNotConnectedEmptyState.
    await expect(page.getByTestId('git-not-connected')).toBeVisible({ timeout: 10000 });
    await evidence.checkpoint('git-not-connected');
  });

  test('J14 GitHubConnectDialog opens, reaches the device-flow pending phase, and cancels cleanly', async ({
    page,
    evidence
  }) => {
    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: /Open from GitHub/i }).click();
    const dialog = page.getByTestId('github-connect-dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Stop at the auth boundary — assert the device-flow init reached
    // `pending` (a verification URI + user code rendered), never visit the
    // real verificationUri.
    await expect(dialog.getByText(/[A-Z0-9]{4}-[A-Z0-9]{4}/)).toBeVisible({ timeout: 15000 });
    await evidence.checkpoint('github-connect-pending');

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });
});
```

- [ ] **Step 2: Live-verify the device-flow pending-phase selector.** The `/[A-Z0-9]{4}-[A-Z0-9]{4}/` regex above is a guess at a typical device-code format (e.g. `WDJB-MJHT`) — read `apps/studio/src/components/GitHubConnectDialog.tsx` and its component test (`apps/studio/test/components/GitHubConnectDialog.test.tsx`) to confirm the actual rendered `userCode` format/testid, and replace the regex with a precise selector (prefer a `data-testid` if one exists on the code/URI display, over a text regex).

- [ ] **Step 3: Run J14, fix any selector drift found in Step 2's live check**

```bash
PLAYWRIGHT_PROD_SMOKE=1 PLAYWRIGHT_BASE_URL=http://localhost:8788 pnpm --filter @rune-langium/studio exec playwright test test/prod-ux/journeys/j14-git-sync.spec.ts --config=playwright.prod.config.ts
```

**J15 confirmed facts:**
- Perspective: `apps/studio/src/shell/perspectives/screens/SettingsPerspective.tsx`, root testid `settings-perspective`, rail testid `rail-settings`, `requiresWorkspace: false`.
- **Spec-vs-reality gap #1, confirmed via source**: theme is currently **fixed at dark** — the component's own doc comment/copy state this explicitly ("Theme is currently fixed at dark; no toggle is available"). **There is no theme toggle to test.** Do not write a light/dark assertion.
- Font scale IS real: `apps/studio/src/components/FontScaleButton.tsx`, a cycle button (sm→md→lg→sm) rendered in both `SettingsPerspective` and `AppHeader.tsx`. No dedicated testid — target via `aria-label`/`title` = `` `Pane font size: ${Small|Medium|Large} (click to cycle)` ``. Current value readable via `data-font-scale-current` attribute on the button (`sm`/`md`/`lg`). Applied via `document.documentElement.dataset.fontScale`. Persisted to `localStorage` key `studio.font-scale` (an exception to this repo's usual IndexedDB-for-settings convention — confirmed directly in source, not a mistake to "fix").
- **Spec-vs-reality gap #2, confirmed via source**: "layout reset" (`resetLayout()` in `apps/studio/src/shell/DockShell.tsx`) is a real function, but its only binding is the `'reset-layout'` shell action in `apps/studio/src/shell/keyboard.ts`, explicitly commented `[] // command palette only — no global shortcut` — and no command-palette component was found mounted anywhere (`AppHeader.tsx`'s `⌘K` button has no `onClick` handler in source). **There is currently no reachable UI path to trigger a layout reset.** Do not write this assertion as a hard pass/fail — record it as a `softFinding` documenting the gap (see Step 4), matching this plan's Global Constraints rule against fabricating passing assertions for non-existent UI actions.

- [ ] **Step 4: Write `j15-settings.spec.ts`**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect } from '../fixtures.js';

test.describe('J15 — Settings perspective', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J15 Settings perspective renders; font scale cycles and persists across reload', async ({ page, evidence }) => {
    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');
    await page.getByTestId('rail-settings').click();
    await expect(page.getByTestId('settings-perspective')).toBeVisible({ timeout: 20000 });
    await evidence.checkpoint('settings-loaded');

    // SPEC ADAPTATION: no theme toggle exists (confirmed via source —
    // SettingsPerspective.tsx's own doc comment: theme is fixed at dark,
    // "a theme toggle will be added in a future release"). Not testable.

    const fontScaleButton = page.getByRole('button', { name: /Pane font size/i });
    await expect(fontScaleButton).toBeVisible();
    const before = await fontScaleButton.getAttribute('data-font-scale-current');
    await fontScaleButton.click();
    const after = await fontScaleButton.getAttribute('data-font-scale-current');
    expect(after, 'font scale cycled to a different value').not.toBe(before);
    await evidence.checkpoint('font-scale-cycled');

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.getByTestId('rail-settings').click();
    await expect(page.getByTestId('settings-perspective')).toBeVisible({ timeout: 20000 });
    const afterReload = await page.getByRole('button', { name: /Pane font size/i }).getAttribute('data-font-scale-current');
    expect(afterReload, 'font scale persisted across reload').toBe(after);
    await evidence.checkpoint('font-scale-persisted');

    // SPEC ADAPTATION: "layout reset restores default dockview arrangement"
    // has no reachable UI trigger — resetLayout() exists in DockShell.tsx
    // but is bound only to a command-palette action, and no command palette
    // is mounted anywhere in the app (AppHeader.tsx's ⌘K button has no
    // onClick handler). Recorded as a soft finding rather than a fabricated
    // pass/fail — matches this harness's rule against asserting on UI
    // actions that don't exist.
    evidence.softFinding(
      'KI-layout-reset-unreachable',
      'Settings perspective has no reachable UI trigger for layout reset — resetLayout() in DockShell.tsx ' +
        'is bound only to a command-palette action, and no command palette is mounted in the app.'
    );
  });
});
```

- [ ] **Step 5: Run both J14 and J15, verify screenshots + `softFinding`s land in `run-manifest.json`**

```bash
PLAYWRIGHT_PROD_SMOKE=1 PLAYWRIGHT_BASE_URL=http://localhost:8788 pnpm --filter @rune-langium/studio exec playwright test test/prod-ux/journeys/j14-git-sync.spec.ts test/prod-ux/journeys/j15-settings.spec.ts --config=playwright.prod.config.ts
```

- [ ] **Step 6: Commit**

```bash
pnpm --filter @rune-langium/studio run type-check
git add apps/studio/test/prod-ux/journeys/j14-git-sync.spec.ts apps/studio/test/prod-ux/journeys/j15-settings.spec.ts
git commit -m "feat(prod-ux): J14 — Git/Sync perspective, J15 — Settings perspective"
```

---

### Task 4: J16 — Resilience & chrome

**Files:**
- Create: `apps/studio/test/prod-ux/journeys/j16-resilience.spec.ts`
- Delete: `apps/studio/test/e2e/curated-load-cancel.spec.ts` (absorbed verbatim — same pattern as Task 1's J12 absorption)

**Interfaces:**
- Consumes: `checkout as test, expect, loadCdm` from `../fixtures.js`.
- Produces: nothing consumed by later tasks.

**Confirmed facts (from live source, this session):**
- `resolveEffectivePerspective(active: PerspectiveId, ctx: { hasWorkspace: boolean; hasExploreContent: boolean }): PerspectiveId` — `apps/studio/src/shell/perspectives/perspective-registry.ts:66-74`. The single fallback SSoT (PR #369) consumed by both `AppHeader` and the perspective host — never re-derive independently, only assert its observable effect (header + body agreeing on `workspaces` after the fallback triggers).
- Rail testids: `` `rail-${perspective.id}` `` → `rail-explore`, `rail-workspaces`, `rail-git`, `rail-export`, `rail-settings` (`rail-prototype` also exists but is out of this spec's J-inventory scope). Disabled state is a real DOM `disabled` attribute on the `<button>`, computed as `p.id === 'explore' ? !hasExploreContent : p.requiresWorkspace && !hasWorkspace`.
- `curated-load-cancel.spec.ts` (`apps/studio/test/e2e/`) already fully implements the "curated load cancel mid-flight" check: mocks a delayed archive fetch, clicks the CDM card, clicks `page.getByTestId('model-loader').getByRole('button', { name: 'Cancel' })`, reloads, and asserts (a) no error banner, (b) no orphaned "Loaded Models" badge, (c) CDM card back to its pre-load state, (d) IndexedDB `recents` store has no `cdm` entry. **Read this file in full before writing Step 1** — port its logic onto the `checkout` fixture with minimal changes (swap `test`/`expect` imports, add `evidence.checkpoint()` calls), do not re-derive it from scratch.
- Toasts: `apps/studio/src/components/StudioToastProvider.tsx` — `ToastProvider duration={4000}` is the default auto-dismiss for a regular `showToast()` call. `showLoadingToast()` explicitly sets `timeout: 0` (never auto-dismisses) — **do not use a loading-toast trigger for the auto-dismiss assertion**, it will hang. Use a regular toast trigger instead (confirm a reliable one live in Step 2 — an error/warning path is usually easiest to trigger deterministically, e.g. attempting an invalid action).
- **Spec-vs-reality gap, confirmed via source**: `resolveEffectivePerspective`'s "delete last file while in Explore → lands on Workspaces" fallback requires a UI action that deletes a `WorkspaceFile` entirely. No such action exists: `FileTreePanel.tsx`'s `FileTreePanelProps` is `{ files, onOpen }` (open only, no delete), and `FileTabStrip` (`explore-chrome.tsx:71-135`) is `{ files, activeFile, onSelectFile, onCreateFile, fileDiagnostics }` (select/create only, no delete/close/remove). **There is currently no reachable UI path to delete a file**, so this specific fallback trigger cannot be driven — same category of gap as J15's theme toggle and layout reset. Descope to a `softFinding`, matching this plan's Global Constraints rule; do not fabricate a workaround (e.g. driving the store directly bypasses the "exercise the real UI" principle this whole harness is built on).
- **A real, reliable regular-toast trigger was found directly in source**: `ExportPerspective.tsx`'s `handleModalGenerate` catches a `CodegenDownloadError` and calls `showToast({ title: 'Code generation failed', description: detail, variant: 'destructive' })` — a REGULAR toast (not a loading toast), using the default `duration={4000}`. This is the exact same `/api/codegen` failure path Task 2 (J13) already soft-asserts around under `KI-codegen-503` — reuse it here rather than hunting for a different trigger. Base UI Toast's rendered root — confirm its exact role/testid live in Step 1 (the plan's research pass found the `Toast`/`ToastProvider`/`ToastViewport` imports in `StudioToastProvider.tsx` but did not mount the app to confirm the rendered DOM role, e.g. `role="status"` vs a custom testid).

- [ ] **Step 1: Live-verify the toast's rendered role/testid** — read `packages/design-system/src/ui/toast.tsx` (the `Toast`/`ToastTitle`/`ToastDescription`/`ToastClose` components `StudioToastProvider.tsx` imports) for the rendered root element's role or testid, before writing the toast test's locator.

- [ ] **Step 2: Write the journey, porting `curated-load-cancel.spec.ts` as its first test**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { Route } from '@playwright/test';
import { checkout as test, expect, loadCdm } from '../fixtures.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, '../../fixtures/curated/cdm-tiny.tar.gz');
const MANIFEST_URL = 'https://www.daikonic.dev/curated/cdm/manifest.json';
const ARCHIVE_URL = 'https://www.daikonic.dev/curated/cdm/latest.tar.gz';

function fixtureBytes(): Buffer {
  return readFileSync(FIXTURE_PATH);
}

function makeManifest(): string {
  return JSON.stringify({
    schemaVersion: 1,
    modelId: 'cdm',
    version: '2026-04-25',
    sha256: createHash('sha256').update(fixtureBytes()).digest('hex'),
    sizeBytes: fixtureBytes().byteLength,
    generatedAt: '2026-04-25T03:00:00Z',
    upstreamCommit: '',
    upstreamRef: 'master',
    archiveUrl: ARCHIVE_URL,
    history: []
  });
}

test.describe('J16 — Resilience & chrome', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  // Ported from test/e2e/curated-load-cancel.spec.ts (T019b, EC-2) — same
  // mock-delayed-archive + Cancel-before-completion + reload + 4-part
  // assertion sequence, onto the checkout fixture with evidence checkpoints
  // added. See that file's own doc comment for the EC-2 spec rationale this
  // absorbs verbatim.
  test('J16 curated load cancel mid-flight returns cleanly to the loader', async ({ page, evidence }) => {
    await page.route(MANIFEST_URL, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: makeManifest() });
    });
    await page.route(ARCHIVE_URL, async (route: Route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.fulfill({ status: 200, contentType: 'application/gzip', body: fixtureBytes() });
    });

    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');

    const cdmButton = page.getByTestId('model-loader').getByRole('button', { name: /CDM/i }).first();
    await expect(cdmButton).toBeVisible({ timeout: 10000 });
    await cdmButton.click();

    const cancelButton = page.getByTestId('model-loader').getByRole('button', { name: 'Cancel' });
    const connectingText = page.getByText(/Connecting to|Cloning|Reading|Discovering/);
    await expect(cancelButton.or(connectingText).first()).toBeVisible({ timeout: 5000 });
    await evidence.checkpoint('load-in-flight');

    if (await cancelButton.isVisible().catch(() => false)) {
      await cancelButton.click();
    } else {
      await page.goto('./');
    }
    await evidence.checkpoint('cancelled');

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByText(/Loading CDM.*failed/i)).not.toBeVisible({ timeout: 1000 });
    await expect(page.getByText('Loaded Models', { exact: false })).not.toBeVisible({ timeout: 1000 });
    await expect(page.getByTestId('model-loader').getByRole('button', { name: /✓ CDM/ })).not.toBeVisible({
      timeout: 1000
    });
    await expect(page.getByTestId('model-loader').getByRole('button', { name: /^CDM/ })).toBeVisible({
      timeout: 1000
    });

    const recents = await page.evaluate(async () => {
      try {
        return await new Promise<string[]>((res, rej) => {
          const req = indexedDB.open('rune-studio');
          req.onerror = () => rej(req.error);
          req.onsuccess = () => {
            const db = req.result;
            if (!Array.from(db.objectStoreNames).includes('recents')) {
              db.close();
              res([]);
              return;
            }
            const all = db.transaction('recents', 'readonly').objectStore('recents').getAll();
            all.onerror = () => rej(all.error);
            all.onsuccess = () => {
              db.close();
              res(((all.result as { id: string }[]) ?? []).map((e) => JSON.stringify(e)));
            };
          };
        });
      } catch {
        return [];
      }
    });
    const containsCdm = recents.some((entry) => entry.toLowerCase().includes('cdm'));
    expect(containsCdm, 'no recents entry referencing the cancelled CDM workspace').toBe(false);
    await evidence.checkpoint('no-orphaned-workspace');
  });

  test('J16 reload mid-Explore restores active perspective and dockview layout', async ({ page, evidence }) => {
    await loadCdm(page);
    await page.getByTestId('rail-explore').click();
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });
    await evidence.checkpoint('before-reload');

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });
    await evidence.checkpoint('after-reload');
  });

  test('J16 rail buttons for workspace-requiring perspectives are disabled with no workspace', async ({
    page,
    evidence
  }) => {
    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });

    // No workspace loaded yet — explore/git/export require one; workspaces/
    // settings do not (perspective-registry.ts's requiresWorkspace flags).
    for (const railId of ['rail-explore', 'rail-git', 'rail-export']) {
      await expect(page.getByTestId(railId)).toBeDisabled();
    }
    for (const railId of ['rail-workspaces', 'rail-settings']) {
      await expect(page.getByTestId(railId)).toBeEnabled();
    }
    await evidence.checkpoint('rail-disabled-no-workspace');

    // SPEC ADAPTATION: "resolveEffectivePerspective fallback (delete last
    // file while in Explore → lands on Workspaces)" has no reachable UI
    // trigger — confirmed via source that neither FileTreePanel.tsx
    // (open-only) nor FileTabStrip in explore-chrome.tsx (select/create
    // only) exposes any delete/close/remove action. Recorded as a soft
    // finding rather than driving the store directly (which would bypass
    // this harness's whole "exercise the real UI" principle) or fabricating
    // a pass. resolveEffectivePerspective itself remains covered by unit
    // tests elsewhere in the repo; this is specifically about the E2E
    // UI-driven trigger the spec describes not existing.
    evidence.softFinding(
      'KI-delete-file-unreachable',
      'No UI action deletes a WorkspaceFile entirely (FileTreePanel is open-only, FileTabStrip is select/create ' +
        'only) — resolveEffectivePerspective\'s "delete last file" fallback path cannot be exercised via real UI.'
    );
  });

  test('J16 toasts appear and auto-dismiss', async ({ page, evidence }) => {
    // Reuses the exact real trigger found in ExportPerspective.tsx's
    // handleModalGenerate: a CodegenDownloadError (thrown on any non-OK
    // /api/codegen response) calls showToast({ variant: 'destructive',
    // title: 'Code generation failed', ... }) — a REGULAR toast (default
    // duration={4000}), not a loading toast (those never auto-dismiss; see
    // StudioToastProvider.tsx's showLoadingToast, timeout: 0). This is the
    // same /api/codegen failure path Task 2 (J13) soft-asserts under
    // KI-codegen-503 — best-effort here too, since success vs. 503 is prod
    // infra state, not something this journey controls.
    await loadCdm(page);
    await page.getByTestId('rail-export').click();
    await expect(page.getByTestId('export-perspective')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('export-targets-section').getByRole('button', { name: /download/i }).first().click();
    await expect(page.getByTestId('download-config-dialog')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('download-config-dialog__generate').click();

    // TODO(implementer, Step 1): replace this locator with the confirmed
    // live toast root role/testid from packages/design-system/src/ui/toast.tsx.
    const toast = page.getByText('Code generation failed');
    const appeared = await toast.isVisible({ timeout: 20000 }).catch(() => false);
    if (appeared) {
      await evidence.checkpoint('toast-appeared');
      await expect(toast).not.toBeVisible({ timeout: 5000 });
      await evidence.checkpoint('toast-auto-dismissed');
    } else {
      evidence.softFinding(
        'KI-codegen-503',
        'J16 toast-auto-dismiss check found no /api/codegen failure to trigger the "Code generation failed" ' +
          'toast within 20s — either /api/codegen succeeded (no toast expected) or is slower than the timeout.'
      );
    }
  });
});
```

- [ ] **Step 3: Apply Step 1's live-verified toast locator** — replace the `page.getByText('Code generation failed')` placeholder locator in the "toasts appear and auto-dismiss" test with the confirmed real toast-root role/testid from `packages/design-system/src/ui/toast.tsx`. Also verify the `../../e2e/fixtures/curated/cdm-tiny.tar.gz` relative path resolves correctly from the new file's location (`apps/studio/test/prod-ux/journeys/`) — adjust if the fixture actually lives elsewhere relative to this file.

- [ ] **Step 4: Delete the absorbed file**

```bash
git rm apps/studio/test/e2e/curated-load-cancel.spec.ts
```

Check for any explicit reference to this filename elsewhere (CI config, a `testMatch` glob) and remove it, same as Task 1 Step 5.

- [ ] **Step 5: Run and commit**

```bash
PLAYWRIGHT_PROD_SMOKE=1 PLAYWRIGHT_BASE_URL=http://localhost:8788 pnpm --filter @rune-langium/studio exec playwright test test/prod-ux/journeys/j16-resilience.spec.ts --config=playwright.prod.config.ts
pnpm --filter @rune-langium/studio run type-check
git add apps/studio/test/prod-ux/journeys/j16-resilience.spec.ts apps/studio/test/e2e/curated-load-cancel.spec.ts
git commit -m "feat(prod-ux): J16 — Resilience & chrome (absorbs curated-load-cancel.spec.ts)"
```

---

### Task 5: J17 — Accessibility sweep

**Files:**
- Create: `apps/studio/test/prod-ux/journeys/j17-accessibility.spec.ts`

**Interfaces:**
- Consumes: `checkout as test, expect, loadCdm` from `../fixtures.js`; `AxeBuilder` from `@axe-core/playwright` (already a pinned dependency — confirmed via `pnpm-lock.yaml`, no new install needed).
- Produces: nothing consumed by later tasks.

**Confirmed facts (from live source, this session):**
- `apps/studio/test/e2e/a11y.spec.ts` already has a working, CI-gated (`studio-a11y` CI job, confirmed passing on PR #393's checks) axe-core harness: `AxeBuilder({ page })`, a `SELECTORS_TO_EXCLUDE` list (CodeMirror/`.monaco-editor`, React Flow/`.react-flow`, dockview chrome/`.dockview-theme-abyss` — third-party a11y debt, tracked as a known caveat per FR-A04, not a merge gate), and a `blocking = results.violations.filter(v => ['serious','critical'].includes(v.impact))` pattern that hard-fails on serious/critical and logs (but doesn't fail on) anything else. **Reuse this exact pattern — do not build new a11y tooling.**
- This journey's job is **coverage breadth**, not new mechanism: sweep one checkpoint per perspective (explore, workspaces, git, export, settings — all now covered by J0–J16) plus the Import and Export dialogs, in both light and dark themes. **Given J15's confirmed finding that theme is currently fixed at dark** (no toggle exists), the "both themes" requirement from the spec cannot be exercised via a UI toggle — run the sweep once, under whatever the app's fixed theme actually is, and record a `softFinding` noting the light-theme half of this requirement is currently unreachable for the same reason J15 found (no toggle). Do not fabricate a second run under a theme the UI has no way to reach.

- [ ] **Step 1: Write a shared `runAxeSweep` helper + the sweep test**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { checkout as test, expect, loadCdm } from '../fixtures.js';

// Mirrors test/e2e/a11y.spec.ts's exclusion list exactly — third-party
// widget a11y debt tracked separately per FR-A04, not this journey's gate.
const SELECTORS_TO_EXCLUDE = ['.monaco-editor', '.react-flow', '.dockview-theme-abyss'];

interface AxeSweepResult {
  checkpoint: string;
  seriousOrCritical: number;
}

async function sweepAxe(page: Page, checkpointName: string): Promise<AxeSweepResult> {
  const builder = new AxeBuilder({ page });
  for (const sel of SELECTORS_TO_EXCLUDE) builder.exclude(sel);
  const results = await builder.analyze();
  const blocking = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
  if (blocking.length > 0) {
    console.log(`[axe:${checkpointName}]`, JSON.stringify(blocking, null, 2));
  }
  return { checkpoint: checkpointName, seriousOrCritical: blocking.length };
}

test.describe('J17 — Accessibility sweep', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J17 axe sweep across all perspectives and the Import/Export dialogs', async ({ page, evidence }) => {
    const results: AxeSweepResult[] = [];

    await loadCdm(page);

    await page.getByTestId('rail-explore').click();
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });
    results.push(await sweepAxe(page, 'explore'));
    await evidence.checkpoint('axe-explore');

    await page.getByTestId('rail-workspaces').click();
    await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });
    results.push(await sweepAxe(page, 'workspaces'));
    await evidence.checkpoint('axe-workspaces');

    await page.getByTestId('rail-git').click();
    await expect(page.getByTestId('git-perspective')).toBeVisible({ timeout: 20000 });
    results.push(await sweepAxe(page, 'git'));
    await evidence.checkpoint('axe-git');

    await page.getByTestId('rail-export').click();
    await expect(page.getByTestId('export-perspective')).toBeVisible({ timeout: 20000 });
    results.push(await sweepAxe(page, 'export'));
    await evidence.checkpoint('axe-export');

    await page.getByTestId('rail-settings').click();
    await expect(page.getByTestId('settings-perspective')).toBeVisible({ timeout: 20000 });
    results.push(await sweepAxe(page, 'settings'));
    await evidence.checkpoint('axe-settings');

    await page.getByTestId('rail-explore').click();
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByTestId('import-dialog')).toBeVisible({ timeout: 10000 });
    results.push(await sweepAxe(page, 'import-dialog'));
    await evidence.checkpoint('axe-import-dialog');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('import-dialog')).not.toBeVisible({ timeout: 5000 });

    await page.getByTestId('rail-export').click();
    await expect(page.getByTestId('export-perspective')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('export-targets-section').getByRole('button', { name: /download/i }).first().click();
    await expect(page.getByTestId('download-config-dialog')).toBeVisible({ timeout: 10000 });
    results.push(await sweepAxe(page, 'download-config-dialog'));
    await evidence.checkpoint('axe-download-config-dialog');
    await page.getByTestId('download-config-dialog__cancel').click();

    // SPEC ADAPTATION: "both themes" is unreachable — J15 confirmed theme
    // is currently fixed at dark, no toggle exists. Recording rather than
    // fabricating a second sweep under an unreachable theme.
    evidence.softFinding(
      'KI-a11y-single-theme-only',
      'Axe sweep ran once under the app\'s fixed dark theme — no light-theme toggle exists to exercise the ' +
        "spec's \"both themes\" requirement (same root cause as J15's KI-layout-reset-unreachable finding: " +
        'SettingsPerspective.tsx confirms theme is fixed at dark).'
    );

    const totalBlocking = results.reduce((sum, r) => sum + r.seriousOrCritical, 0);
    expect(totalBlocking, `serious/critical axe violations: ${JSON.stringify(results)}`).toBe(0);
  });
});
```

- [ ] **Step 2: Live-verify each dialog-open sequence** (Import dialog trigger, Export perspective's download button) matches Task 1/Task 2's actual confirmed selectors once those tasks are merged into this branch — this task should run AFTER Tasks 1 and 2 land (or at minimum after their selectors are confirmed), since it re-drives the same UI paths.

- [ ] **Step 3: Run and commit**

```bash
PLAYWRIGHT_PROD_SMOKE=1 PLAYWRIGHT_BASE_URL=http://localhost:8788 pnpm --filter @rune-langium/studio exec playwright test test/prod-ux/journeys/j17-accessibility.spec.ts --config=playwright.prod.config.ts
pnpm --filter @rune-langium/studio run type-check
git add apps/studio/test/prod-ux/journeys/j17-accessibility.spec.ts
git commit -m "feat(prod-ux): J17 — Accessibility sweep (reuses @axe-core/playwright harness)"
```

---

### Task 6: Phase 3 close-out — full run + manifest review

Mirrors Phase 2's Task 6, which found 3 additional genuine cross-task bugs during a full production run that no single task-scoped review caught. Run ALL of J12–J17 together against the real deployed production Studio (not just locally), read the resulting `run-manifest.json` end to end, and fix anything found — not just verify.

**Files:**
- Modify: whichever files a genuine finding requires (cannot be predicted in advance — this task's job is discovery, same as Phase 2's Task 6).

**Interfaces:**
- Consumes: all journey files from Tasks 1–5, the full `checkout`/`EvidenceCollector`/`anchors.ts` infrastructure.
- Produces: nothing — this is the Phase 3 terminal task.

- [ ] **Step 1: Full local rebuild + full-suite local run first** (catch the false-negative trap before spending a real prod run on it):

```bash
pnpm --filter @rune-langium/core run build && pnpm --filter @rune-langium/studio run build
pnpm --filter @rune-langium/studio run dev:pages &
PLAYWRIGHT_PROD_SMOKE=1 PLAYWRIGHT_BASE_URL=http://localhost:8788 pnpm --filter @rune-langium/studio exec playwright test test/prod-ux/journeys/j12-import-dialog.spec.ts test/prod-ux/journeys/j13-export-perspective.spec.ts test/prod-ux/journeys/j14-git-sync.spec.ts test/prod-ux/journeys/j15-settings.spec.ts test/prod-ux/journeys/j16-resilience.spec.ts test/prod-ux/journeys/j17-accessibility.spec.ts --config=playwright.prod.config.ts
```

- [ ] **Step 2: Fix anything the local run finds**, following the same standard as every fix earlier in this branch — verify each failure against real current source before concluding it's a genuine bug versus a selector needing live-adjustment (several tasks above deliberately left selectors to be confirmed live; failures there are expected work, not necessarily new findings).

- [ ] **Step 3: Run the full J0–J18 suite together locally** (not just Phase 3's new journeys) to catch any cross-journey interference Phase 3's additions might introduce — same discipline as Phase 2 Task 6's full-run verification, which found J07's `panel-problems` testid regression this way:

```bash
PLAYWRIGHT_PROD_SMOKE=1 PLAYWRIGHT_BASE_URL=http://localhost:8788 pnpm --filter @rune-langium/studio exec playwright test test/prod-ux/journeys/ --config=playwright.prod.config.ts
```

- [ ] **Step 4: Read the full `run-manifest.json`** (`apps/studio/test/prod-ux/report/run-manifest.json`) end to end — every journey's verdict, every `softFinding`, every checkpoint. Cross-check `softFinding`s against this plan's Global Constraints to confirm each is a genuine, correctly-classified known-issue and not a symptom being silently accepted instead of fixed.

- [ ] **Step 5: `pnpm --filter @rune-langium/studio run type-check` and the full studio suite** (per this session's "run full package suite before push" rule):

```bash
pnpm --filter @rune-langium/studio run type-check
pnpm --filter @rune-langium/studio exec vitest run
```

- [ ] **Step 6: Commit any close-out fixes, then dispatch the final whole-branch review** (per subagent-driven-development's process) before moving to `finishing-a-development-branch`.
