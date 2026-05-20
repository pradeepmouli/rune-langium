// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Test helpers for interacting with Radix UI Dialog / Popover overlays.
 *
 * Radix's overlay primitives (`@radix-ui/react-dialog`,
 * `@radix-ui/react-popover`) unmount their content asynchronously via the
 * internal `Presence` wrapper — close (Esc, outside click, X button) sets
 * the dialog's open state to false synchronously, but the actual DOM
 * removal waits for the Presence animation/transition cleanup plus the
 * React render batch that drains afterwards.
 *
 * Using `fireEvent.keyDown(document.body, { key: 'Escape' })` only
 * dispatches the synthetic event — it does not wait for the unmount and
 * any `expect(...).not.toBeInTheDocument()` immediately after will flake
 * in CI. Copilot flagged this on PR #215's `EditorPage-curated-models`
 * test, and the fix (mirrored here) is to use `userEvent.keyboard` for a
 * proper key sequence and `waitFor` for the unmount.
 *
 * Every future Radix Dialog/Popover Esc-close test should call this helper
 * instead of duplicating the userEvent + waitFor boilerplate.
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';

/**
 * Press Escape and wait for the overlay carrying `testid` to leave the DOM.
 *
 * Uses `userEvent.keyboard('{Escape}')` for the keystroke (matches a real
 * user event sequence — fires keydown + keyup + bubbles through React's
 * synthetic event system) and `waitFor` to ride out the Radix Presence
 * unmount race.
 *
 * @param testid - `data-testid` on the DialogContent / PopoverContent root.
 *
 * @example
 *   fireEvent.click(screen.getByRole('button', { name: /open dialog/i }));
 *   expect(screen.getByTestId('my-dialog')).toBeInTheDocument();
 *   await closeDialogViaEscape('my-dialog');
 */
export async function closeDialogViaEscape(testid: string): Promise<void> {
  const user = userEvent.setup();
  await user.keyboard('{Escape}');
  await waitFor(() => {
    expect(screen.queryByTestId(testid)).not.toBeInTheDocument();
  });
}
