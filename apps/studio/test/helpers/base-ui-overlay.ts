// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Test helpers for interacting with Base UI Dialog / Popover overlays.
 *
 * Escape changes open state before the portal finishes unmounting. Use the
 * helper below so assertions wait for the actual DOM transition.
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';

/**
 * Press Escape and wait for the overlay carrying `testid` to leave the DOM.
 *
 * Uses `userEvent.keyboard('{Escape}')` for the keystroke (matches a real
 * user event sequence — fires keydown + keyup + bubbles through React's
 * synthetic event system) and `waitFor` for the portal unmount.
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
