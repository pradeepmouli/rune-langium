// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect, loadCdm, authorScratchType, authorScratchFunction, readOpLog } from '../fixtures.js';
import { ANCHOR_DATA, ANCHOR_FUNCTION } from '../anchors.js';

test.describe('J9 — Form preview & function execution', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test(
    'J9 form preview + validation for curated and scratch data types',
    { annotation: { type: 'journey-subid', description: 'form-preview' } },
    async ({ page, evidence }) => {
      await loadCdm(page);
      await page.getByTestId('rail-explore').click();
      await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });

      // Navigate to ANCHOR_DATA (cdm.base.datetime.BusinessCenters), matching
      // J04's namespace-search + ns-type-nav pattern.
      const namespaceSearch = page.getByTestId('namespace-search');
      await namespaceSearch.fill('BusinessCenters');
      const curatedFormStartedAt = Date.now();
      await page.getByTestId(`ns-type-nav-${ANCHOR_DATA}`).click();
      // "Form" is a tab (role="tab"), not a button, and is already the
      // default-active sub-tab of the right-hand dock panel on node
      // selection (confirmed live this session) — no click needed.
      await expect(page.getByTestId('panel-formPreview')).toBeVisible({ timeout: 20000 });
      const curatedFormRenderMs = Date.now() - curatedFormStartedAt;

      // FINDING (this session): ANCHOR_DATA's every attribute (businessCenter,
      // commodityBusinessCalendar, businessCentersReference) is optional
      // (0..*/0..*/0..1) and either an unresolved Data reference (kind
      // 'unknown', never renders a FieldError) or an Enum select (Radix Select
      // only offers valid values — there is no way to type an "invalid" one).
      // The type's own `condition BusinessCentersChoice: required choice ...`
      // cross-field rule is a Rune business-rule condition, not a Zod
      // structural constraint — apps/studio/src/services/preview-validator.ts's
      // validatePreviewSample only enforces per-field required/kind rules plus
      // Choice-arm presence (schema.kind === 'choice' or schema.choiceArmPaths,
      // neither of which apply to a plain `type` with a `condition` block), so
      // this schema can NEVER produce a role="alert" FieldError regardless of
      // what's filled in. The panel does render its own "Limited preview"
      // schema-level status instead (schema.status === 'unsupported'), which
      // this asserts. The full invalid→alert→valid round trip is exercised
      // below on the scratch type, which — unlike ANCHOR_DATA — has a real
      // required scalar attribute; per the harness's own curated/scratch
      // disambiguation convention (see the J9 spec's "Curated-side failures
      // classify as corpus-drift candidates" note), a scratch-side failure
      // would be the unambiguous regression signal here.
      const formPanel = page.getByTestId('panel-formPreview');
      await expect(formPanel.getByRole('heading', { name: 'BusinessCenters' })).toBeVisible();
      await expect(page.getByText('Limited preview', { exact: false })).toBeVisible();
      evidence.softFinding(
        'KI-anchor-data-no-field-validation',
        'ANCHOR_DATA (cdm.base.datetime.BusinessCenters) has no required scalar/enum field and no choice-arm ' +
          'condition enforcement in the client preview validator, so it cannot produce a role="alert" field ' +
          'validation message; the invalid/valid round trip is only exercised on the scratch type below.'
      );
      await evidence.checkpoint('curated-form-preview');

      // Attribute name deliberately NOT 'label' — that's a reserved keyword in
      // the Rune DSL grammar (`[label "..."]` LabelAnnotation syntax in
      // rune-dsl.langium), so `label string (1..1)` is a genuine parse error,
      // not a form-preview issue (confirmed this session: it left the type
      // permanently stuck on "Generating preview…" with a real "1 err" — a
      // finding worth recording in case another attribute name collides with
      // one of this grammar's other reserved words: add/alias/all/and/
      // annotation/any/as/basicType/body/choice/condition/contains/corpus/
      // count/default/definition/disjoint/displayName/distinct/else/empty/
      // enum/exists/extends/extract/filter/first/flatten/for/from/func/
      // function/hint/if/import/in/inputs/is/item/join/last/library/mapper/
      // maps/max/merge/meta/metaType/min/multiple/namespace/only/optional/or/
      // output/override/path/pattern/prefix/rationale/recordType/reduce/
      // report/required/reverse/root/rule/scope/segment/set/single/sort/
      // source/standard/sum/super/switch/synonym/tag/then/to/type/typeAlias/
      // using/value/version/when/with).
      await authorScratchType(page, {
        name: 'ScratchWidget',
        namespace: 'scratch.j9form',
        attributes: [{ name: 'title', typeName: 'string', cardinality: '(1..1)' }]
      });
      // authorScratchType only asserts the nav row is visible — it doesn't
      // navigate into it (matches J8's established pattern: the caller clicks
      // ns-type-nav-<fqn> itself after authoring).
      const scratchFormStartedAt = Date.now();
      await page.getByTestId('ns-type-nav-scratch.j9form.ScratchWidget').click();
      await expect(page.getByTestId('panel-formPreview')).toBeVisible({ timeout: 20000 });
      const scratchFormRenderMs = Date.now() - scratchFormStartedAt;

      // ScratchWidget.title is required (1..1) — leaving it empty and blurring
      // triggers apps/studio/src/services/preview-validator.ts's
      // `z.string().trim().min(1, '${field.label} is required')`, rendered by
      // FormPreviewPanel.tsx's FieldError as <p role="alert" class="... text-
      // destructive">. `role=alert` alone is ambiguous — the panel's own
      // schema-level status paragraph (`role={status.state === 'invalid' ?
      // 'alert' : 'status'}`) ALSO becomes role="alert" once the sample is
      // invalid, and dockview renders its own empty live-region alert div —
      // scope to FieldError's distinguishing `text-destructive` class
      // (confirmed live this session: exactly 3 role="alert" elements exist
      // once the sample goes invalid).
      const titleField = page.getByLabel('Title', { exact: true });
      await titleField.click();
      await titleField.blur();
      const alert = page.locator('p.text-destructive[role="alert"]');
      await expect(alert).toBeVisible({ timeout: 10000 });
      await expect(alert).toContainText(/required/i);

      // A valid value clears the alert.
      await titleField.fill('Widget A');
      await titleField.blur();
      await expect(alert).toHaveCount(0);
      await evidence.checkpoint('scratch-form-preview');

      if (curatedFormRenderMs > 5000 || scratchFormRenderMs > 5000) {
        evidence.softFinding(
          'formRender-budget',
          `formRender took ${Math.max(curatedFormRenderMs, scratchFormRenderMs)}ms`
        );
      }
    }
  );

  test(
    'J9 executes a curated corpus function and a scratch-authored function',
    { annotation: { type: 'journey-subid', description: 'function-execution' } },
    async ({ page, evidence }) => {
      await loadCdm(page);
      await page.getByTestId('rail-explore').click();
      await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });

      // Navigate to ANCHOR_FUNCTION (cdm.base.math.StringEquals). Selecting a
      // function node opens Form preview directly into FormPreviewPanel.tsx's
      // `schema.kind === 'function'` execution branch — no separate "Form" tab
      // click needed (confirmed this session: it's already the active
      // sub-tab).
      const namespaceSearch = page.getByTestId('namespace-search');
      await namespaceSearch.fill('StringEquals');
      await page.getByTestId(`ns-type-nav-${ANCHOR_FUNCTION}`).click();
      await expect(page.getByTestId('panel-formPreview')).toBeVisible({ timeout: 20000 });

      // `exact: true` — Playwright's getByLabel does substring, case-
      // insensitive matching by default, and a bare 'S1'/'S2'/'X' would also
      // match unrelated chrome (e.g. the "Export code" button's aria-label
      // contains an 'x'; confirmed live this session).
      await page.getByLabel('S1', { exact: true }).fill('hello');
      await page.getByLabel('S2', { exact: true }).fill('hello');
      await page.getByRole('button', { name: 'Run' }).click();
      // The function-execution output and the (unrelated) "Sample data"
      // preview share the SAME class, `preview-panel__sample-output`
      // (FormPreviewPanel.tsx — the execution-result `<pre>` and the
      // sample-data-output `<pre>` both carry it) — scope to the
      // execution-result wrapper to avoid a Playwright strict-mode violation
      // matching both elements.
      const curatedOutput = page.locator('.execution-result .preview-panel__sample-output');
      await expect(curatedOutput).toBeVisible({ timeout: 20000 });
      await expect(curatedOutput).toHaveText('true');
      await evidence.checkpoint('curated-function-executed');

      // Author a scratch function via Source-pane typing (same no-graphical-
      // creation constraint as types — see authorScratchFunction's doc note).
      // Double(x) = x * 2; deliberately avoids if/then/else (see
      // authorScratchFunction's ScratchFunctionSpec.body doc note on the
      // execution-engine gap discovered this session).
      await authorScratchFunction(page, {
        name: 'Double',
        namespace: 'scratch.j9func',
        inputs: [{ name: 'x', typeName: 'number', cardinality: '(1..1)' }],
        outputName: 'result',
        outputType: 'number',
        outputCardinality: '(1..1)',
        body: 'x * 2'
      });
      // authorScratchFunction only asserts the nav row is visible — the
      // caller navigates into it (same pattern as authorScratchType above).
      await page.getByTestId('ns-type-nav-scratch.j9func.Double').click();
      await expect(page.getByTestId('panel-formPreview')).toBeVisible({ timeout: 20000 });
      // `exact: true` — see the S1/S2 comment above; a bare 'X' also matches
      // unrelated chrome.
      await page.getByLabel('X', { exact: true }).fill('5');
      await page.getByRole('button', { name: 'Run' }).click();
      const scratchOutput = page.locator('.execution-result .preview-panel__sample-output');
      await expect(scratchOutput).toBeVisible({ timeout: 20000 });
      await expect(scratchOutput).toHaveText('10');
      await evidence.checkpoint('scratch-function-executed');

      // Deploy-sequencing note: this will fail against a live production run
      // until the branch carrying Task 1's functionExecute instrumentation
      // (commit 290c3b28) merges and deploys — production currently serves
      // master, which predates it. The in-browser bundle under test, not the
      // Node/Playwright process, is what needs the instrumentation, so this
      // affects both the curated AND scratch execution checks identically.
      // Expected to go green automatically post-merge; see Task 6 close-out.
      const opLog = await readOpLog(page);
      const executeEntries = opLog.filter((e) => e.op === 'functionExecute');
      expect(executeEntries.length, 'expected functionExecute op-log entries (Task 1 instrumentation)').toBeGreaterThan(
        0
      );

      const slowExecutions = executeEntries.filter((e) => (e.durationMs ?? 0) > 5000);
      if (slowExecutions.length > 0) {
        evidence.softFinding(
          'functionExecute-budget',
          `functionExecute took ${Math.max(...slowExecutions.map((e) => e.durationMs ?? 0))}ms`
        );
      }
    }
  );
});
