// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { expect, type Locator, type Page } from '@playwright/test';
import type {} from '../../src/services/type-graph-window-bridge.js';

export async function waitForHydratedNode(page: Page, fqn: string): Promise<void> {
  await page.waitForFunction(
    (id) => window.__runeStudioTypeGraph?.snapshot().some((node) => node.id === id && !node.deferred),
    fqn,
    { timeout: 30_000 }
  );
}

/** Require populated attributes, not just the Inspector's persistent Members tab. */
export async function expectPopulatedAttributes(inspector: Locator): Promise<void> {
  await expect(inspector.getByText(/^Attributes \([1-9]\d*\)$/)).toBeVisible({ timeout: 30_000 });
}

/** Measure the resting UI while allowing perpetual activity spinners to run. */
export async function waitForEntranceAnimations(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document.getAnimations().filter((animation) => {
              const timing = animation.effect?.getComputedTiming();
              return (
                (animation.playState === 'running' || animation.pending) &&
                timing !== undefined &&
                Number.isFinite(timing.endTime)
              );
            }).length
        ),
      { timeout: 5_000, message: 'Finite UI animations should settle before accessibility scans' }
    )
    .toBe(0);
}

/** CodeMirror keeps its DOM editable for focus/selection even when document edits are disabled. */
export async function expectSourceReadOnly(source: Locator): Promise<void> {
  await expect(source).toHaveAttribute('aria-readonly', 'true');
  await source.pressSequentially('__readonly_probe__');
  await expect(source).not.toContainText('__readonly_probe__');
}
