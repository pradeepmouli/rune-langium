// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { Buffer } from 'node:buffer';
import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { EvidenceCollector, appendJourneyRecord, type JourneyRecord } from './evidence.js';

interface CheckoutFixtures {
  evidence: EvidenceCollector;
}

export const checkout = base.extend<CheckoutFixtures>({
  evidence: async ({ page }, use, testInfo) => {
    const journeyId = testInfo.title.match(/^(J\d+[a-z]?)/)?.[1] ?? testInfo.title;
    const collector = new EvidenceCollector(page, journeyId, testInfo.title, testInfo.retry);
    await use(collector);
    const baseVerdict = testInfo.status === testInfo.expectedStatus ? 'PASS' : 'FAIL';
    const verdict = baseVerdict === 'PASS' && collector.hasSoftFindings ? 'DEGRADED' : baseVerdict;
    const opLog = await readOpLog(page);
    const record: JourneyRecord = await collector.finish(verdict, opLog);
    await appendJourneyRecord(record);
  }
});

export { expect };

export interface OpLogEntry {
  opId?: number;
  op: string;
  subject?: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  durationMs?: number;
  ts: number;
  panel: 'output' | 'activity';
}

// Playwright's page.evaluate callback type-checks against the DOM lib's own
// Window type, which does NOT see apps/studio/src's `declare global`
// augmentation (op-log-window-bridge.ts) — that augmentation only merges
// into programs that include the src file. Re-declare it locally so this
// fixture module type-checks standalone.
declare global {
  interface Window {
    __runeStudioOpLog?: { snapshot(): OpLogEntry[] };
  }
}

/** Reads window.__runeStudioOpLog.snapshot() from the page — installed by op-log-window-bridge.ts (Task 4). */
export async function readOpLog(page: Page): Promise<OpLogEntry[]> {
  return page.evaluate(() => window.__runeStudioOpLog?.snapshot() ?? []);
}

const CDM_BUTTON = 'CDM (Common Domain Model)';
const WORKSPACE_FILE_NAME = 'starter.rosetta';
const WORKSPACE_FILE_CONTENT = 'namespace example\n';

/** Ported verbatim from test/prod-smoke/production-checkout.spec.ts's loadCdm helper. */
export async function loadCdm(page: Page): Promise<void> {
  await page.goto('./');
  await page.waitForLoadState('domcontentloaded');
  await expect(page).toHaveTitle(/Rune Studio/);
  await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });

  const fileInput = page.locator('input[type="file"][accept=".rosetta"]');
  await fileInput.setInputFiles([
    { name: WORKSPACE_FILE_NAME, mimeType: 'text/plain', buffer: Buffer.from(WORKSPACE_FILE_CONTENT) }
  ]);
  await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('rail-workspaces').click();
  await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });

  await page.getByTestId('model-loader').getByRole('button', { name: CDM_BUTTON }).click();

  await expect(page.getByText('Loaded Models', { exact: false })).toBeVisible({ timeout: 90000 });
  await expect(page.getByRole('button', { name: `Unload ${CDM_BUTTON}` })).toBeVisible({ timeout: 90000 });
}

export interface ScratchAttributeSpec {
  name: string;
  typeName: string;
  /** e.g. '(1..1)', '(0..*)' — parens included, matches raw Rune DSL syntax. */
  cardinality: string;
}

export interface ScratchTypeSpec {
  name: string;
  namespace: string;
  attributes: ScratchAttributeSpec[];
  /**
   * Additional raw Rune DSL declarations (each a full `type`/`enum`/
   * `choice` block, trailing newline included) authored in the SAME Source
   * block immediately after the primary `type <name>:` declaration. Lets a
   * root type reference not-yet-defined sibling types via forward
   * reference within one namespace — used by J18's closure fixture, which
   * needs a nested Data type, an Enum, and a Choice declared alongside the
   * root in a single scratch workspace. Optional; every existing caller
   * (J8, J9) is unaffected.
   */
  extraDeclarations?: string[];
}

/**
 * Reaches a blank scratch workspace and a cleared, focused Source editor,
 * ready for paced typing. Shared by `authorScratchType` and
 * `authorScratchFunction` below — both author a top-level declaration via
 * raw Rune DSL typing (this app has no graphical "create type"/"create
 * function" UI; see `authorScratchType`'s own doc comment for the type
 * side of that finding), so the reach-workspace + open-Source + select-all
 * + delete boilerplate is centralized here rather than duplicated per
 * declaration kind (DRY).
 *
 * Reaches a blank workspace via the same file-input flow J02/J07 already
 * use (a fresh Playwright page gets its own OPFS/IndexedDB origin, so this
 * always starts from an empty workspace on the FIRST call in a test).
 *
 * A later call in the SAME test — e.g. J9's curated-then-scratch function
 * journey, which calls `loadCdm(page)` before `authorScratchFunction(page)`
 * — is a different case: `page.goto('./')` reopens whatever workspace is
 * already active instead of showing the fresh model-loader screen the file
 * input below expects (confirmed live against production this session).
 * Force it via the same `rail-workspaces` round trip `loadCdm` itself
 * already uses to get FROM a freshly-created workspace BACK to the loader
 * screen — but only when needed, since that testid doesn't exist yet on a
 * truly first-ever page load (the model-loader renders standalone, with no
 * rail chrome, until a workspace exists).
 */
async function reachBlankScratchSource(page: Page): Promise<Locator> {
  await page.goto('./');
  await page.waitForLoadState('domcontentloaded');
  const modelLoader = page.getByTestId('model-loader');
  if (!(await modelLoader.isVisible().catch(() => false))) {
    await page.getByTestId('rail-workspaces').click();
  }
  await expect(modelLoader).toBeVisible({ timeout: 20000 });

  const fileInput = page.locator('input[type="file"][accept=".rosetta"]');
  await fileInput.setInputFiles([
    { name: WORKSPACE_FILE_NAME, mimeType: 'text/plain', buffer: Buffer.from(WORKSPACE_FILE_CONTENT) }
  ]);
  await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: 'Source' }).click();
  const editor = page.getByTestId('source-editor').locator('.cm-content');
  await expect(editor).toBeVisible({ timeout: 10000 });
  await editor.click();

  const platformModifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${platformModifier}+A`);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);

  return editor;
}

/**
 * Authors a new Data type in a fresh scratch workspace by typing raw Rune
 * DSL into the Source editor and waiting for the app's debounced reparse to
 * pick it up.
 *
 * This app has no graphical "create type" UI — `TypeCreator.tsx` and
 * `editor-store.ts`'s `createType` action are fully implemented but have
 * zero JSX call sites anywhere in the app (confirmed via full-tree search).
 * Every other e2e test that involves a "new" type loads a pre-written
 * `.rosetta` file and edits *existing* nodes graphically. This helper is
 * deliberately the ONE place that authors a type via live Source-pane
 * typing — J8, J9, and J18 all import it rather than re-deriving the same
 * setup (DRY; see the Phase 2 plan's Task 2 design note).
 *
 * Typing is deliberately PACED — a per-keystroke delay plus a short wait
 * after each line — rather than one bulk write. A fast/instant bulk write
 * can race the workspace's debounced OPFS save (a remove+recreate of the
 * underlying file), truncating the persisted content; pacing the input
 * avoids that race. See task-2-report.md's OPFS-save-race finding.
 */
export async function authorScratchType(page: Page, spec: ScratchTypeSpec): Promise<void> {
  const editor = await reachBlankScratchSource(page);

  await editor.pressSequentially(`namespace ${spec.namespace}\n`, { delay: 20 });
  await page.waitForTimeout(800);
  await editor.pressSequentially(`\ntype ${spec.name}:\n`, { delay: 20 });
  await page.waitForTimeout(800);
  for (const attribute of spec.attributes) {
    await editor.pressSequentially(`    ${attribute.name} ${attribute.typeName} ${attribute.cardinality}\n`, {
      delay: 20
    });
    await page.waitForTimeout(800);
  }
  for (const declaration of spec.extraDeclarations ?? []) {
    await editor.pressSequentially(`\n${declaration}`, { delay: 20 });
    await page.waitForTimeout(800);
  }

  const namespaceSearch = page.getByTestId('namespace-search');
  await namespaceSearch.fill(spec.name);
  await expect(page.getByTestId(`ns-type-nav-${spec.namespace}.${spec.name}`)).toBeVisible({ timeout: 15000 });
}

export interface ScratchFunctionInputSpec {
  name: string;
  typeName: string;
  /** e.g. '(1..1)' — parens included, matches raw Rune DSL syntax. */
  cardinality: string;
}

export interface ScratchFunctionSpec {
  name: string;
  namespace: string;
  inputs: ScratchFunctionInputSpec[];
  outputName: string;
  outputType: string;
  /** e.g. '(1..1)' — parens included, matches raw Rune DSL syntax. */
  outputCardinality: string;
  /**
   * Raw Rune expression assigned via `set <outputName>: <body>`. Keep this
   * free of `if`/`then`/`else` — the studio's client-side function-execution
   * engine (`codegen-worker.ts`'s `stripTypeAnnotations` + `new Function()`
   * wrapper) cannot currently evaluate a generated ternary from a Rune
   * conditional expression (confirmed live this session: even the curated
   * `cdm.base.math.Max`/`Min`/`Abs` functions, which ARE all `if a > b then
   * a else b`-shaped, fail Run with "Error: Unexpected token 'if'"). Plain
   * arithmetic/comparison bodies (e.g. `x * 2`) execute correctly.
   */
  body: string;
  /**
   * Optional `condition <name>: <expression>` block, authored between
   * `output:` and `set <outputName>: ...` — matches the grammar's own
   * declaration order (`inputs`, `output`, `shortcuts`, `conditions`,
   * `operations`; confirmed against `RosettaFunction` in
   * packages/core/src/grammar/rune-dsl.langium and the real
   * `packages/codegen/test/fixtures/funcs/precondition-alias/input.rune`
   * fixture). Added for J10 (Task 4) — LanguageLensEditor is mounted as a
   * function's condition expression editor, so J10 needs a scratch
   * function with a condition, not just a body.
   *
   * Keep `expression` inside the language lens's subset S
   * (ComparisonOperation/EqualityOperation/LogicalOperation/
   * ArithmeticOperation/RosettaExistsExpression/RosettaAbsentExpression/
   * RosettaFeatureCall — see packages/codegen/src/lens/subset.ts) or the
   * TypeScript/Python lens falls back to the "can't be shown in {Language}"
   * read-only state instead of rendering a textbox. A plain comparison like
   * `amount > 0` is in-subset and round-trips (confirmed live this session
   * against production).
   */
  condition?: {
    name: string;
    expression: string;
  };
}

/**
 * Authors a new Function declaration in a fresh scratch workspace, by the
 * SAME Source-pane-typing mechanism `authorScratchType` uses above — this
 * app has no graphical "create function" UI either (same constraint,
 * confirmed the same way). Shares `reachBlankScratchSource` with
 * `authorScratchType` rather than re-deriving the reach-workspace +
 * open-Source + paced-typing setup (DRY; see the Phase 2 plan's Task 3
 * design note — J9 is the only journey that needs to author a function).
 */
export async function authorScratchFunction(page: Page, spec: ScratchFunctionSpec): Promise<void> {
  const editor = await reachBlankScratchSource(page);

  await editor.pressSequentially(`namespace ${spec.namespace}\n`, { delay: 20 });
  await page.waitForTimeout(800);
  await editor.pressSequentially(`\nfunc ${spec.name}:\n`, { delay: 20 });
  await page.waitForTimeout(800);
  await editor.pressSequentially(`    inputs:\n`, { delay: 20 });
  await page.waitForTimeout(800);
  for (const input of spec.inputs) {
    await editor.pressSequentially(`        ${input.name} ${input.typeName} ${input.cardinality}\n`, { delay: 20 });
    await page.waitForTimeout(800);
  }
  await editor.pressSequentially(`    output:\n`, { delay: 20 });
  await page.waitForTimeout(800);
  await editor.pressSequentially(`        ${spec.outputName} ${spec.outputType} ${spec.outputCardinality}\n`, {
    delay: 20
  });
  await page.waitForTimeout(800);
  if (spec.condition) {
    await editor.pressSequentially(`\n    condition ${spec.condition.name}:\n`, { delay: 20 });
    await page.waitForTimeout(800);
    await editor.pressSequentially(`        ${spec.condition.expression}\n`, { delay: 20 });
    await page.waitForTimeout(800);
  }
  await editor.pressSequentially(`    set ${spec.outputName}: ${spec.body}\n`, { delay: 20 });
  await page.waitForTimeout(800);

  const namespaceSearch = page.getByTestId('namespace-search');
  await namespaceSearch.fill(spec.name);
  await expect(page.getByTestId(`ns-type-nav-${spec.namespace}.${spec.name}`)).toBeVisible({ timeout: 15000 });
}
