// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { expect, type Locator, type Page } from '@playwright/test';

async function expectUsableBox(
  locator: Locator,
  label: string,
  thresholds: { minWidth: number; minHeight: number }
): Promise<void> {
  await expect(locator).toBeVisible({ timeout: 10_000 });
  const box = await locator.boundingBox();
  expect(box, `${label} should have a measurable layout box`).not.toBeNull();
  expect(box!.width, `${label} should stay wide enough to be usable`).toBeGreaterThan(thresholds.minWidth);
  expect(box!.height, `${label} should stay tall enough to be usable`).toBeGreaterThan(thresholds.minHeight);
}

export async function assertWorkbenchUsable(page: Page): Promise<void> {
  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
  const shellThresholds = {
    minWidth: Math.max(320, Math.floor(viewport.width * 0.4)),
    minHeight: Math.max(260, Math.floor(viewport.height * 0.45))
  };

  await expectUsableBox(page.getByTestId('dock-shell'), 'dock shell', shellThresholds);
  await expectUsableBox(page.getByTestId('explore-workbench'), 'explore workbench', shellThresholds);
  await expectUsableBox(page.getByTestId('center-stack'), 'center stack', {
    minWidth: 220,
    minHeight: Math.max(180, Math.floor(viewport.height * 0.25))
  });
}
