// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { expect, type Locator } from '@playwright/test';

/** Wait for camera fitting to finish, then require the node to fit its pane. */
export async function expectContainedInPane(node: Locator, pane: Locator): Promise<void> {
  await expect(node).toBeVisible();
  await expect
    .poll(
      async () => {
        const [child, parent] = await Promise.all([node.boundingBox(), pane.boundingBox()]);
        return (
          !!child &&
          !!parent &&
          child.width > 0 &&
          child.height > 0 &&
          child.x >= parent.x - 2 &&
          child.y >= parent.y - 2 &&
          child.x + child.width <= parent.x + parent.width + 2 &&
          child.y + child.height <= parent.y + parent.height + 2
        );
      },
      { message: 'The structure node should fit inside its resized pane' }
    )
    .toBe(true);
}
