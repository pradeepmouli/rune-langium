// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * J15 — Settings perspective.
 *
 * Live-verified this session before writing assertions:
 *
 * 1. `SettingsPerspective.tsx` — its own copy states theme is "currently
 *    fixed (dark). A theme toggle will be added in a future release." No
 *    theme toggle exists anywhere in the component. Not testable.
 *
 * 2. `FontScaleButton.tsx` — a real cycle button (sm→md→lg→sm), rendered in
 *    both `SettingsPerspective` and `AppHeader.tsx`. No dedicated testid;
 *    targeted via its `aria-label`/`title` (`` `Pane font size: ${label}
 *    (click to cycle)` ``), with current value readable via
 *    `data-font-scale-current`. Applied to `document.documentElement.
 *    dataset.fontScale`; persisted to `localStorage['studio.font-scale']`.
 *    LIVE FINDING (this session, confirmed by an actual strict-mode
 *    violation when run against a rebuilt local prod bundle): because
 *    FontScaleButton is mounted in BOTH AppHeader (always visible) and
 *    SettingsPerspective, `page.getByRole('button', { name: /Pane font
 *    size/i })` matches two elements once the Settings perspective is
 *    open. Scoped to `settings-perspective` below to disambiguate — this is
 *    a real, reproducible two-instance DOM fact, not a flaky selector.
 *
 * 3. Layout reset — `resetLayout()` (`DockShell.tsx:376-405`) is a real
 *    function, but `keyboard.ts`'s `BINDINGS['reset-layout']` is a literal
 *    empty array with the comment `// command palette only — no global
 *    shortcut`. Confirmed no command palette is mounted anywhere: the only
 *    matching UI is `AppHeader.tsx`'s `⌘K` button
 *    (`className="studio-topbar__cmdk"`, `aria-label="Search"`), which has
 *    NO `onClick` handler in source — clicking it is a no-op. There is
 *    currently no reachable UI path to trigger a layout reset. Recorded
 *    below as a `softFinding` (`KI-layout-reset-unreachable`) rather than a
 *    fabricated pass/fail assertion on a nonexistent UI action.
 */

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

    // LIVE FINDING (see file-header comment #2): FontScaleButton is mounted
    // in both AppHeader (always visible) and SettingsPerspective — an
    // unscoped getByRole match hits both. Scope to settings-perspective.
    const settingsPanel = page.getByTestId('settings-perspective');
    const fontScaleButton = settingsPanel.getByRole('button', { name: /Pane font size/i });
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
    const afterReload = await page
      .getByTestId('settings-perspective')
      .getByRole('button', { name: /Pane font size/i })
      .getAttribute('data-font-scale-current');
    expect(afterReload, 'font scale persisted across reload').toBe(after);
    await evidence.checkpoint('font-scale-persisted');

    // Phase 5 (spec §7): Privacy → telemetry opt-in toggle. It's a base-ui
    // Checkbox (button role="checkbox"), not a native input — per J12's own
    // finding, .setChecked()/.isChecked() can no-op against this component,
    // so this asserts aria-checked directly after an explicit click (same
    // pattern j12-import-dialog.spec.ts already established).
    const telemetryToggle = page.getByTestId('settings-telemetry-toggle');
    await expect(telemetryToggle).toBeVisible();
    await expect(telemetryToggle, 'telemetry opt-in defaults to unchecked').toHaveAttribute('aria-checked', 'false');
    await telemetryToggle.click();
    await expect(telemetryToggle).toHaveAttribute('aria-checked', 'true');
    await evidence.checkpoint('telemetry-toggle-checked');

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.getByTestId('rail-settings').click();
    await expect(page.getByTestId('settings-perspective')).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByTestId('settings-telemetry-toggle'),
      'telemetry opt-in persisted across reload'
    ).toHaveAttribute('aria-checked', 'true');
    await evidence.checkpoint('telemetry-toggle-persisted');

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
