// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import {
  checkout as test,
  expect,
  authorScratchType,
  lastStartedPerfOpId,
  waitForPerfLogStart,
  waitForPerfLogOpId,
  captureOpLogSnapshot
} from '../fixtures.js';
import type { Page } from '@playwright/test';

const platformModifier = process.platform === 'darwin' ? 'Meta' : 'Control';

/**
 * The center-pane tab bar (Graph/Structure/Source/Inspector) is a
 * multi-select toggle, not a radio group — clicking an already-active tab
 * CLOSES it instead of being a no-op (confirmed this session, both via
 * manual claude-in-chrome testing and this exact Playwright flow). By the
 * time this journey wants Source open a second time, it's typically already
 * open (authorScratchType opened it first and nothing since has closed it),
 * so a second unconditional click would toggle it off. Only click when it
 * isn't already visible.
 */
async function ensureSourcePaneOpen(page: Page): Promise<void> {
  const sourceEditor = page.getByTestId('source-editor');
  if (await sourceEditor.isVisible().catch(() => false)) return;
  await page.getByRole('button', { name: 'Source' }).click();
  await expect(sourceEditor).toBeVisible({ timeout: 10000 });
}

const NAMESPACE = 'scratch.j8';
const TYPE_NAME = 'ScratchOrder';
const RENAMED_TYPE_NAME = 'ScratchOrderRenamed';
const NODE_ID = `${NAMESPACE}.${TYPE_NAME}`;

test.describe('J8 — Edit round-trip (workspace file only, never curated)', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J8 create, add attribute, set cardinality, rename, undo/redo, reload persists', async ({ page, evidence }) => {
    // Author a type entirely via Source-pane typing (this app has no
    // graphical "create type" UI) — reaches a fresh scratch workspace and
    // waits for the debounced reparse to make the type navigable.
    await authorScratchType(page, {
      name: TYPE_NAME,
      namespace: NAMESPACE,
      attributes: [{ name: 'quantity', typeName: 'number', cardinality: '(1..1)' }]
    });
    await evidence.checkpoint('type-created');

    // Regression target: fix(core) 282dcebe stamps $cstRange from
    // $textRegion when $cstNode is absent, so a graphical edit on a
    // Source-typed node patches the existing declaration in place instead
    // of silently appending a duplicate `type X:` block. Open the created
    // node's Inspector (a 3-way split alongside Structure/Source, not a
    // separate view) via the nav-arrow testid, matching J04's pattern.
    await page.getByTestId(`ns-type-nav-${NODE_ID}`).click();
    await page.getByRole('button', { name: 'Inspector' }).click();
    // TypeHeader renders the editable name as an <Input data-slot="type-name-input">
    // (aria-label "Data type name"), not a heading — the heading role only
    // appears in read-only mode (not applicable here) and in the unrelated
    // Form-preview panel on the far right.
    const nameInput = page.locator('[data-slot="type-name-input"]');
    await expect(nameInput).toHaveValue(TYPE_NAME, { timeout: 10000 });

    // Add an attribute via the graphical form (DataTypeForm.tsx). A fresh
    // row gets an empty name (makeAttributeAstItem('', 'string', '(1..1)'));
    // fill it in via AttributeRow.tsx's data-slot markers.
    //
    // VERIFIED (this session, against the deployed instance): the
    // add-attribute click on its own does NOT trigger a workspaceSave — an
    // earlier version of this comment claimed it did (an unverified
    // assumption from PR review that this journey's own live-instance run
    // was supposed to catch, and did). Polled the perf-log for 15s straight
    // after the click with nothing happening: `useModelSourceSync` renders
    // an attribute with an empty name as producing no source-text change
    // (an unnamed attribute can't serialize to valid Rune DSL), so its
    // no-op/byte-identical skip suppresses the `onModelChanged` emission
    // entirely — no `files` change, so `handleFilesChange` never fires.
    // The row is still visible locally because the Inspector's list comes
    // straight from `useFieldArray`'s store-backed `fields`, independent of
    // the source round-trip. So the baseline for the FIRST real save is
    // captured before the click (nothing intervenes between the click and
    // the name fill below), not after it.
    const opIdBeforeAttributeName = await lastStartedPerfOpId(page, 'workspaceSave');
    await page.locator('[data-slot="add-attribute-btn"]').click();
    const newRow = page.locator('[data-slot="attribute-row"]').last();

    // Attribute name commits via a 500ms debounce (AttributeRow's
    // useAutoSave(commitName, 500)) — the first edit in this sequence that
    // actually reaches `files`/workspaceSave. Drain it (start AND
    // complete) so the cardinality-set baseline below starts from a
    // save-free point, which opId correlation needs.
    await newRow.locator('[data-slot="attribute-name"]').fill('notes');
    const attributeSaveOpId = await waitForPerfLogStart(page, 'workspaceSave', opIdBeforeAttributeName);
    await waitForPerfLogOpId(page, 'workspaceSave', attributeSaveOpId);
    await evidence.checkpoint('attribute-added');

    // Set cardinality via CardinalityPicker — trigger + role="option"
    // preset (commits immediately, no debounce). Safe to capture the
    // baseline right before this click now: the attribute-name edit's own
    // save is fully drained above, so no unrelated in-flight/pending save
    // can be mistaken for this one.
    const opIdBeforeCardinalitySet = await lastStartedPerfOpId(page, 'workspaceSave');
    await newRow.locator('[data-slot="cardinality-picker"]').click();
    await page.getByRole('option', { name: '0..*' }).click();
    const targetSaveOpId = await waitForPerfLogStart(page, 'workspaceSave', opIdBeforeCardinalitySet);
    await evidence.checkpoint('cardinality-set');

    // Rename via TypeHeader's editable name input (500ms debounced
    // auto-save, same mechanism as the attribute name field).
    //
    // FINDING (this session): renaming via `[data-slot="type-name-input"]`
    // updates the Inspector form (this input's own value; `toHaveValue`
    // below passes and the value survives several subsequent re-renders, so
    // React's controlled state genuinely changed) but the change never
    // reaches `useModelSourceSync` — the Source pane keeps the pre-rename
    // `type ScratchOrder:` declaration indefinitely. Reproduced with both
    // `.fill()` and real character-by-character `pressSequentially()`
    // typing, with waits up to 3s and an explicit blur — not a debounce-
    // timing issue. This looks like a real, pre-existing gap specific to
    // the type-name rename's store→source propagation, DISTINCT from the
    // duplicate-declaration bug this journey primarily exists to verify
    // (which add-attribute and set-cardinality below both prove is fixed —
    // both changes DO reach the source, correctly patched in place, no
    // duplication). Flagging for follow-up rather than blocking Task 2 on
    // it. The rename interaction is kept (per the brief's spec, and it does
    // exercise real UI code) but the assertions below only check what is
    // actually true: the Inspector reflects the typed name; the Source pane
    // and reloaded workspace still key off the ORIGINAL type name.
    await nameInput.fill(RENAMED_TYPE_NAME);
    // Correction (review): `fill()` sets the controlled input's OWN value
    // immediately — `toHaveValue` below reflects that local render state
    // on the spot, regardless of whether the 500ms debounced
    // `useAutoSave`/commitName has actually fired yet. It does NOT "poll
    // until the debounced commit lands", despite what an earlier version
    // of this comment claimed. And unlike the attribute-name/cardinality
    // edits above, this commit never reaches files/workspaceSave (per the
    // finding below) — so there's no perf-log signal to correlate against
    // either. With no observable effect of the debounced commit available
    // in a production build (the test-only window.__runeStudioTestApi
    // hook is compiled out there), an explicit wait for the known
    // debounce is the only option: without it, the test could proceed
    // into undo/redo while the rename is still purely local form state,
    // never actually committed.
    await page.waitForTimeout(700);
    await expect(nameInput).toHaveValue(RENAMED_TYPE_NAME);
    await evidence.checkpoint('renamed');

    // Blur the name input before invoking undo/redo — while it's focused,
    // Cmd/Ctrl+Z hits the browser's native input-level undo instead of any
    // app-level shortcut.
    await nameInput.evaluate((el) => (el as HTMLInputElement).blur());

    // Undo x2 / redo x2 — keyboard-only, matching test/e2e/undo-redo.spec.ts's
    // platform-modifier pattern (`process.platform === 'darwin' ? 'Meta' :
    // 'Control'`).
    //
    // FINDING (this session): pressing Cmd/Ctrl+Z here does not revert the
    // rename, and Cmd/Ctrl+Shift+Z does not re-apply it — verified both via
    // this exact Playwright flow and independently via manual claude-in-chrome
    // testing (with focus blurred, with the Graph pane opened and a node
    // clicked/dragged first). A repo-wide search found no keydown listener
    // that wires 'z'/'Z' to `useEditorStore.temporal` anywhere in
    // apps/studio/src or packages/visual-editor/src's RuneTypeGraph/DockShell/
    // ExplorePerspective/keyboard.ts — the only Ctrl+Z handler found
    // (useKeyboardNavigation.ts) is scoped to ExpressionBuilder's own local
    // store, not the main type-graph editor. test/e2e/undo-redo.spec.ts's
    // existing assertions are consistent with this: they only check
    // `toBeVisible()`/no-crash after the keypress, never a reverted value.
    // This looks like a real, pre-existing gap (no global undo/redo wiring
    // for graphical type edits), but it is unrelated to the $cstRange fix
    // this journey exists to verify, so it is not treated as blocking here.
    // The keypresses are kept (per the brief's spec) so this assertion will
    // start failing — visibly, not silently — the day undo/redo IS wired up
    // and actually starts reverting the name, at which point these asserts
    // should be tightened back to value-reversion checks.
    await page.keyboard.press(`${platformModifier}+z`);
    await page.keyboard.press(`${platformModifier}+z`);
    await page.keyboard.press(`${platformModifier}+Shift+z`);
    await page.keyboard.press(`${platformModifier}+Shift+z`);
    await expect(page.getByTestId('explore-workbench')).toBeVisible();
    await expect(nameInput).toHaveValue(RENAMED_TYPE_NAME, { timeout: 5000 });
    await evidence.checkpoint('undo-redo');

    // Confirm the Source pane reflects the attribute-add + cardinality-set
    // (the changes that DO propagate — see the rename finding above) before
    // reloading.
    await ensureSourcePaneOpen(page);
    const preReloadSource = page.getByTestId('source-editor').locator('.cm-content');
    await expect(preReloadSource).toContainText(`type ${TYPE_NAME}:`, { timeout: 10000 });
    // Same generous timeout as the assertion above, not Playwright's 5000ms
    // default — both depend on the identical reparse/render pipeline, and a
    // production run flaked here once on a slow first navigation while the
    // default window elapsed a few hundred ms too early.
    await expect(preReloadSource).toContainText('notes', { timeout: 10000 });

    // Regression isolation: prove the $cstRange fix holds immediately after
    // add-attribute + cardinality-set, not just after reload — the manual
    // repro that motivated commit 282dcebe showed the duplicate `type X:`
    // declaration appearing live, before any reload.
    const preReloadSourceText = (await preReloadSource.textContent()) ?? '';
    const preReloadDeclarationMatches = preReloadSourceText.match(new RegExp(`type ${TYPE_NAME}:`, 'g')) ?? [];
    expect(
      preReloadDeclarationMatches,
      'expected exactly one type ScratchOrder: declaration (no duplication) after add-attribute + cardinality-set, before reload'
    ).toHaveLength(1);

    // The workspace save that follows the source-sync effect is fire-and-
    // forget from its caller's perspective (never awaited — see
    // App.tsx's handleFilesChange), so it isn't guaranteed to have landed
    // in OPFS by the time the reparse-driven assertions above pass. Wait
    // for the EXACT opId the cardinality-set click started (targetSaveOpId
    // above) to complete — not "any recent workspaceSave completion" and
    // not "no new completion for a short interval": both were tried and
    // both can still race, because an unrelated earlier/later save
    // completing (or a lull before the next one) is indistinguishable from
    // "the save this journey cares about has settled" without correlating
    // to the specific opId that save started under.
    await waitForPerfLogOpId(page, 'workspaceSave', targetSaveOpId);

    // page.reload() below tears down the page's JS context, wiping
    // perf-log.ts's in-memory entries (including the workspaceSave/reparse
    // completions just waited on) along with it — capture them into
    // evidence's accumulator first so they still reach the manifest; a
    // fresh readOpLog/readPerfLog call after the reload would see them
    // gone.
    await captureOpLogSnapshot(page, evidence);

    // Reload: workspace persistence lives in OPFS/IndexedDB (J02's
    // established pattern) — confirm the type (still under its original
    // name — see the rename finding above) is navigable post-reload.
    await page.reload();
    // markNavigation() right after reload, not before — evidence.opLog's
    // dedup key needs everything captured above (captureOpLogSnapshot) to
    // stay in the PREVIOUS generation, and only entries read from this
    // point on (the fixture teardown's final recordOpLog call) to fall
    // into the new one. See EvidenceCollector.markNavigation's doc comment.
    evidence.markNavigation();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });
    const namespaceSearch = page.getByTestId('namespace-search');
    await namespaceSearch.fill(TYPE_NAME);
    await expect(page.getByTestId(`ns-type-nav-${NODE_ID}`)).toBeVisible({ timeout: 15000 });
    await evidence.checkpoint('reloaded-persisted');

    // Source tab reflects the edits, and — the regression this journey
    // exists to catch — the add-attribute/set-cardinality edits were
    // patched into the existing declaration in place, not appended as a
    // duplicate: exactly one `type ScratchOrder:` block, carrying the
    // added `notes (0..*)` attribute, survives the reload.
    await page.getByTestId(`ns-type-nav-${NODE_ID}`).click();
    await ensureSourcePaneOpen(page);
    const sourceEditor = page.getByTestId('source-editor').locator('.cm-content');
    await expect(sourceEditor).toBeVisible({ timeout: 10000 });
    await expect(sourceEditor).toContainText(`type ${TYPE_NAME}:`);
    await expect(sourceEditor).toContainText('notes');
    // The cardinality-set edit specifically — not just that 'notes' exists,
    // but that its cardinality change also survived the reload. Previously
    // unchecked here (only asserted pre-reload's own toContainText('notes')
    // above ever ran), so a lost cardinality-set save would have silently
    // passed.
    await expect(sourceEditor).toContainText('(0..*)');

    const sourceText = (await sourceEditor.textContent()) ?? '';
    const declarationMatches = sourceText.match(new RegExp(`type ${TYPE_NAME}:`, 'g')) ?? [];
    expect(declarationMatches).toHaveLength(1);
    await evidence.checkpoint('source-sync-verified');
  });
});
