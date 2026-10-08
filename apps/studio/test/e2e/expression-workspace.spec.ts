// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { referenceFiles } from '../../../../packages/codegen/test/helpers/cdm-reference.js';
import { typeNavigationButton } from '../helpers/type-navigation.js';
import { resolve } from 'node:path';

async function loadPinnedFunction(page: Page) {
  await page.goto('./');
  await page.locator('input[type="file"][accept=".rosetta"]').setInputFiles(
    referenceFiles().map(({ uri, content }) => ({
      name: uri.split('/').at(-1)!,
      mimeType: 'text/plain',
      buffer: Buffer.from(content)
    }))
  );
  await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('namespace-search').fill('Abs');
  await typeNavigationButton(page, 'cdm.base.math.Abs', 'RosettaFunction').click();
  await page.getByRole('button', { name: 'Inspector', exact: true }).click();
  // Local LSP/router notices are dismissible; they must not trap keyboard focus during editing.
  while (await page.getByRole('button', { name: 'Dismiss notification', exact: true }).count())
    await page.getByRole('button', { name: 'Dismiss notification', exact: true }).first().click();
  await expect(page.getByTestId('implementation-editor')).toBeVisible();
}

async function openBuilder(page: Page) {
  await page.getByTestId('implementation-editor').locator('.cm-content').press('ControlOrMeta+End');
  await page
    .getByRole('region', { name: 'Function implementation' })
    .getByRole('button', { name: 'Builder', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Expression builder' });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() =>
      dialog.evaluate((el) =>
        el.getAnimations({ subtree: true }).every((animation) => animation.playState !== 'running')
      )
    )
    .toBe(true);
  return dialog;
}

test('ten-operation CDM function stays one editable implementation with complete projections', async ({ page }) => {
  await page.goto('./');
  await page.locator('input[type="file"][accept=".rosetta"]').setInputFiles(
    referenceFiles(resolve(import.meta.dirname, '../fixtures/cdm-expression')).map(({ uri, content }) => ({
      name: uri.split('/').at(-1)!,
      mimeType: 'text/plain',
      buffer: Buffer.from(content)
    }))
  );
  await page.getByTestId('namespace-search').fill('ConvertToAdjustableOrRelativeDate');
  await typeNavigationButton(page, 'cdm.base.datetime.ConvertToAdjustableOrRelativeDate', 'RosettaFunction').click();
  await page.getByRole('button', { name: 'Inspector', exact: true }).click();
  const implementation = page.getByRole('region', { name: 'Function implementation' });
  const editor = page.getByTestId('implementation-editor').locator('.cm-content');
  await expect(editor).toHaveCount(1);
  await editor.press('ControlOrMeta+a');
  const source = referenceFiles(resolve(import.meta.dirname, '../fixtures/cdm-expression')).find((f) =>
    f.uri.endsWith('/base-datetime-func.rosetta')
  )!.content;
  const body = source.slice(source.indexOf('    alias relativeDate:')).trimEnd();
  const draft =
    body
      .replace('alias relativeDate:', 'alias selectedDate:')
      .replaceAll('if relativeDate exists', 'if selectedDate exists')
      .replaceAll('then relativeDate ->', 'then selectedDate ->')
      .replace('\n    set ', '\n    condition InputPresent:\n        selectedDate exists\n\n    set ')
      .replace('then selectedDate -> periodMultiplier', 'then selectedDate -> periodMultiplier + 0') +
    '\n\n    post-condition OutputPresent:\n        adjustableOrRelativeDate exists';
  await page.keyboard.insertText(draft);
  await expect(editor).toContainText('alias selectedDate:');
  await editor.press('ControlOrMeta+End');
  await expect(editor).toContainText('post-condition OutputPresent:');
  for (const language of ['TypeScript', 'Python']) {
    await implementation.getByRole('button', { name: language, exact: true }).click();
    const projected = page.getByRole('textbox', { name: `Generated ${language.toLowerCase()}` });
    await expect(projected).toContainText('ConvertToAdjustableOrRelativeDate');
    await projected.press('ControlOrMeta+End');
    await expect(projected).toContainText('periodMultiplier');
    await expect(implementation.getByRole('alert')).toHaveCount(0);
  }
  await implementation.getByRole('button', { name: 'Rune', exact: true }).click();
  await editor.press('ControlOrMeta+z');
  await editor.press('ControlOrMeta+Home');
  await expect(editor).toContainText('alias relativeDate:');
});

test('Data conditions have independent active editors and typed projections', async ({ page }) => {
  await loadPinnedFunction(page);
  await page.getByTestId('namespace-search').fill('Frequency');
  await typeNavigationButton(page, 'cdm.base.datetime.Frequency', 'Data').click();
  await page.getByRole('tab', { name: 'Conditions', exact: true }).click();
  await page.getByRole('tab', { name: 'PositivePeriodMultiplier', exact: true }).click();
  const condition = page.getByRole('region', { name: 'Condition expression' });
  await expect(condition.getByTestId('implementation-editor')).toHaveCount(1);
  await expect(condition).toContainText('periodMultiplier > 0');
  await condition.getByRole('button', { name: 'Python', exact: true }).click();
  await expect(condition.getByRole('textbox', { name: 'Generated python' })).toContainText('periodMultiplier');
  await page.getByRole('tab', { name: 'TermPeriod', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Condition expression' })).toContainText('PeriodExtendedEnum');
});

test('Source and Inspector send each edit once through the real network LSP', async ({ page }, testInfo) => {
  test.skip(process.env.PLAYWRIGHT_EXPRESSION_LSP !== '1', 'requires the isolated local LSP Worker');
  const sent: Array<{ method?: string; params?: { textDocument?: { uri?: string } } }> = [];
  page.on('websocket', (socket) =>
    socket.on('framesent', (frame) => {
      try {
        sent.push(JSON.parse(frame.payload.toString()));
      } catch {
        /* non-JSON control frame */
      }
    })
  );
  await loadPinnedFunction(page);
  const isMath = (entry: (typeof sent)[number]) =>
    entry.params?.textDocument?.uri?.endsWith('cdm.base.math--base-math-func.rosetta');
  const changes = () => sent.filter((entry) => entry.method === 'textDocument/didChange' && isMath(entry));
  await expect
    .poll(() => sent.filter((entry) => entry.method === 'textDocument/didOpen' && isMath(entry)).length)
    .toBe(1);
  const implementation = page.getByRole('region', { name: 'Function implementation' });
  const editor = page.getByTestId('implementation-editor').locator('.cm-content');
  let before = changes().length;
  await editor.press('ControlOrMeta+End');
  await editor.press('Space');
  await expect.poll(() => changes().length).toBe(before + 1);
  await implementation.getByRole('button', { name: 'Open in Source', exact: true }).click();
  const source = page.getByTestId('source-editor').filter({ visible: true }).locator('.cm-content');
  await expect(source).toBeVisible();
  before = changes().length;
  await source.press('ControlOrMeta+End');
  await source.press('Space');
  await expect.poll(() => changes().length).toBe(before + 1);
  before = changes().length;
  await editor.press('ControlOrMeta+End');
  await editor.press('Space');
  await expect.poll(() => changes().length).toBe(before + 1);
  expect(sent.filter((entry) => entry.method === 'textDocument/didOpen' && isMath(entry))).toHaveLength(1);
  await testInfo.attach('lsp-document-ownership', {
    body: JSON.stringify({ opens: 1, edits: changes().length }),
    contentType: 'application/json'
  });
});

test('pinned function display, private builder draft, Apply and one undo stay connected', async ({ page }) => {
  await loadPinnedFunction(page);
  const implementation = page.getByRole('region', { name: 'Function implementation' });
  const rune = page.getByTestId('implementation-editor');
  await expect(rune).toHaveCount(1);
  await expect(rune).toContainText('set result: if arg < 0 then -1 * arg else arg');
  for (const language of ['TypeScript', 'Python']) {
    await implementation.getByRole('button', { name: language, exact: true }).click();
    const generated = page.getByRole('textbox', { name: `Generated ${language.toLowerCase()}` });
    await expect(generated).toContainText(
      language === 'Python'
        ? 'def Abs(input: Abs_Input) -> float:'
        : 'export function Abs(input: { arg: number }): number'
    );
    await expect(generated).toHaveAttribute('contenteditable', 'false');
    await expect(implementation.getByText(/can't be shown|not renderable/i)).toHaveCount(0);
  }
  await implementation.getByRole('button', { name: 'Rune', exact: true }).click();
  let dialog = await openBuilder(page);
  await dialog.getByRole('button', { name: 'Text', exact: true }).click();
  await dialog.getByRole('textbox').fill('if arg < 0 then -2 * arg else arg');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(rune).toContainText('-1 * arg');
  dialog = await openBuilder(page);
  await dialog.getByRole('button', { name: 'Text', exact: true }).click();
  await expect(dialog.getByRole('textbox')).toContainText('-1 * arg');
  await dialog.getByRole('textbox').fill('if arg < 0 then -2 * arg else arg');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(rune).toContainText('-2 * arg');
  await rune.locator('.cm-content').press('ControlOrMeta+z');
  await expect(rune).toContainText('-1 * arg');
  await implementation.getByRole('button', { name: 'Open in Source', exact: true }).click();
  await expect(page.getByTestId('source-editor').filter({ visible: true })).toBeVisible();
});

for (const width of [1280, 800]) {
  test(`compact toolbar and builder remain usable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await loadPinnedFunction(page);
    const fontScale = page.getByRole('button', { name: /Pane font size:/ }).first();
    while ((await fontScale.getAttribute('data-font-scale-current')) !== 'lg') await fontScale.click();
    await expect(fontScale).toHaveAttribute('data-font-scale-current', 'lg');
    const implementation = page.getByRole('region', { name: 'Function implementation' });
    await implementation.getByRole('button', { name: 'Builder', exact: true }).scrollIntoViewIfNeeded();
    await expect(implementation.getByRole('button', { name: 'Builder', exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`inspector-${width}.png`) });
    const dialog = await openBuilder(page);
    const issues = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(issues.violations).toEqual([]);
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`builder-${width}.png`) });
    await dialog.getByRole('button', { name: 'Text', exact: true }).click();
    const textIssues = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(textIssues.violations).toEqual([]);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.getByTestId('implementation-editor').locator('.cm-content')).toBeFocused();
    expect(errors.filter((message) => /ResizeObserver|Expression|CodeMirror/.test(message))).toEqual([]);
  });
}
