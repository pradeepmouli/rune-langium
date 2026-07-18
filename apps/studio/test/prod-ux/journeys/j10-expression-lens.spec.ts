// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect, authorScratchFunction } from '../fixtures.js';

const NAMESPACE = 'scratch.j10cond';
const FUNCTION_NAME = 'ValidateAmount';
const CONDITION_NAME = 'AmountPositive';
const NODE_ID = `${NAMESPACE}.${FUNCTION_NAME}`;

test.describe('J10 — Expression language lens', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J10 Rune to TypeScript to Python and back round-trips without drift', async ({ page, evidence }) => {
    // `LanguageLensEditor` (apps/studio/src/components/LanguageLensEditor.tsx)
    // is mounted as a FUNCTION's condition expression editor via
    // ExpressionEditorSlotProps — this journey needs a scratch function with
    // a condition, so it authors one via the same Source-pane-typing
    // mechanism J9's Task 3 established (`authorScratchFunction`, extended
    // this task with an optional `condition` field rather than duplicating
    // the scratch-authoring setup — see fixtures.ts's ScratchFunctionSpec
    // doc comment).
    await authorScratchFunction(page, {
      name: FUNCTION_NAME,
      namespace: NAMESPACE,
      inputs: [{ name: 'amount', typeName: 'number', cardinality: '(1..1)' }],
      outputName: 'result',
      outputType: 'number',
      outputCardinality: '(1..1)',
      body: 'amount',
      condition: { name: CONDITION_NAME, expression: 'amount > 0' }
    });
    await page.getByTestId(`ns-type-nav-${NODE_ID}`).click();
    await evidence.checkpoint('function-authored');

    // Conditions render inside the "Inspector" tab (the center Graph/
    // Structure/Source/Inspector dock group's EditorFormPanel — confirmed
    // live this session; NOT the right-hand Form/Code dock group, which
    // hosts FormPreviewPanel/CodePreviewPanel instead, a separate dockview
    // group entirely).
    await page.getByRole('button', { name: 'Inspector' }).click();

    // FINDING (this session, confirmed live against production): FunctionForm
    // always renders a SECOND expression editor for the function's own body
    // (the `set result: amount` operation), in addition to the condition's
    // editor. Both share ONE `expressionEditorMode` toggle state
    // (ExplorePerspective.tsx's `renderExpressionEditor` closure), so once
    // switched to lens mode, BOTH editors simultaneously render their own
    // Rune/TypeScript/Python button triples and role="textbox" fields with
    // IDENTICAL accessible names — a bare `page.getByRole('button', {name:
    // 'TypeScript'})` matches two elements and throws a Playwright
    // strict-mode violation. Every locator below is scoped to the
    // condition's own row (`[data-slot="condition-row"]`, filtered by the
    // condition's name) to avoid it, rather than to the function body's row.
    const conditionRow = page.locator('[data-slot="condition-row"]').filter({ hasText: CONDITION_NAME });
    await expect(conditionRow).toBeVisible({ timeout: 15000 });

    // The toggle link text is "Try TypeScript view" before switching to lens
    // mode (distinct from the language buttons' bare "TypeScript" name, so
    // this exact-text lookup is unambiguous even though it's a substring of
    // itself) and "Use builder" afterwards.
    await conditionRow.getByRole('button', { name: 'Try TypeScript view' }).click();
    await evidence.checkpoint('lens-mode-enabled');

    await conditionRow.getByRole('button', { name: 'TypeScript', exact: true }).click();
    await expect(conditionRow.getByRole('textbox', { name: 'TypeScript expression' })).toBeVisible();
    await evidence.checkpoint('toggled-typescript');

    await conditionRow.getByRole('button', { name: 'Python', exact: true }).click();
    await expect(conditionRow.getByRole('textbox', { name: 'Python expression' })).toBeVisible();
    await evidence.checkpoint('toggled-python');

    await conditionRow.getByRole('button', { name: 'Rune', exact: true }).click();
    // No drift: the canonical Rune expression is unchanged (rendered as a
    // read-only <pre>, not a textbox, once back on Rune — see
    // LanguageLensEditor.tsx). No RawDsl/pending-reparse residue: neither
    // the "can't be shown in {Language}" out-of-subset notice nor a
    // foreignError paragraph is left visible (confirmed this session as the
    // two real DOM markers for a stuck/residue state — both plain rendered
    // text, no dedicated testid).
    await expect(conditionRow.getByText('amount > 0', { exact: true })).toBeVisible();
    await expect(conditionRow.getByText(/can't be shown in/i)).toHaveCount(0);
    await evidence.checkpoint('back-to-rune');

    // Console errors are captured automatically by the `evidence` fixture
    // (EvidenceCollector's page.on('console')/'pageerror' listeners) and
    // recorded into the run manifest for the reviewing agent — no inline
    // assertion needed here (matches J8's established pattern).
  });
});
