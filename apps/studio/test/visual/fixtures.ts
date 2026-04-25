// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Pre-migration baseline fixtures for the editor-form visual-regression
 * + auto-save perf suites (T003–T006 of `specs/013-z2f-editor-migration`).
 *
 * The fixture is intentionally tiny: one node per form kind, each with the
 * minimum field set the editor renders. Larger CDM corpora are out of scope
 * — this file is the regression oracle for SC-004 / SC-007.
 */

import type { Page } from '@playwright/test';

/**
 * Single .rosetta source containing one node per kind: Data (type), Choice,
 * Enum, plus Function and TypeAlias when the parser supports the syntax used.
 *
 * Mirrors `ROSETTA_SIMPLE` from `apps/studio/test/e2e/visual-regression.spec.ts`
 * (which is known to parse cleanly) and extends it with one func + one
 * typeAlias node. If parsing of either of the latter fails locally, the
 * `NODES_BY_KIND` table can be reduced to the three confirmed kinds.
 */
export const FORMS_BASELINE_ROSETTA = `namespace demo.forms
version "1.0.0"

type Person:
  name string (1..1)
  age int (0..1)

type Employee extends Person:
  employeeId string (1..1)
  department string (0..1)

enum RoleEnum:
  Manager
  Developer
  Designer

choice PersonOrRole:
  Person
  RoleEnum

typeAlias EmployeeIdAlias:
    string

func ResolveEmployee:
    inputs:
        id string (1..1)
    output:
        result Employee (0..1)
`;

/**
 * Map from a form-kind label to the node name it should select. Used by
 * `selectNode` and by the spec's `for…of` loop.
 */
export const NODES_BY_KIND = {
  data: 'Person',
  choice: 'PersonOrRole',
  enum: 'RoleEnum',
  function: 'ResolveEmployee',
  typeAlias: 'EmployeeIdAlias'
} as const;

export type FormKind = keyof typeof NODES_BY_KIND;

/**
 * Load the baseline fixture into the studio. Mirrors the loader pattern used
 * by `apps/studio/test/e2e/visual-regression.spec.ts` (file-input upload).
 */
export async function loadFormsBaseline(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  const fileInput = page.locator('input[type="file"][accept=".rosetta"]');
  await fileInput.setInputFiles({
    name: 'forms-baseline.rosetta',
    mimeType: 'text/plain',
    buffer: Buffer.from(FORMS_BASELINE_ROSETTA)
  });
  await page.waitForSelector('[data-testid="editor-page"]', { timeout: 15000 });
  // Allow the namespace tree + graph nodes to settle.
  await page.waitForTimeout(1500);
}

/**
 * Select a node of the given kind via the namespace explorer. After this
 * resolves, the inspector panel is showing the node's form.
 */
export async function selectNode(page: Page, kind: FormKind): Promise<void> {
  const nodeName = NODES_BY_KIND[kind];
  // Expand the namespace tree (the chevron toggles type visibility).
  const chevron = page.locator('.ns-row__chevron').first();
  await chevron.click().catch(() => {
    /* already expanded — ignore */
  });
  // Pick the type row by data-testid prefix + text. The class-based
  // `.ns-type__name` selector is stale (Tailwind migration removed it);
  // the row container's `data-testid="ns-type-<nodeId>"` is stable.
  const typeRow = page.locator('[data-testid^="ns-type-"]').filter({ hasText: nodeName });
  await typeRow.first().waitFor({ state: 'visible', timeout: 10000 });
  // Click the name span specifically (the row has a visibility-toggle button
  // next to it; clicking the row's first child would trigger the wrong
  // handler). The name span has cursor-pointer + onClick={onSelectNode}.
  await typeRow.first().locator('span.cursor-pointer').first().click();
  await page.locator('[data-testid="panel-inspector"]').waitFor({ timeout: 5000 });
  await page.waitForTimeout(500);
}

/**
 * Selector that scopes a screenshot/perf measurement to the inspector form
 * area only (excluding shell chrome). Each form root carries the
 * `data-slot="*-form"` marker added by the editor components.
 */
export const INSPECTOR_FORM_ROOT = '[data-testid="panel-inspector"]';
