// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { GlobalSearch } from '../../src/shell/GlobalSearch.js';

afterEach(cleanup);

it.each([{ metaKey: true }, { ctrlKey: true }])('opens search with its unmodified primary shortcut: %j', (modifier) => {
  render(<GlobalSearch hasWorkspace={false} hasExploreContent={false} />);
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ...modifier, cancelable: true })));
  expect(screen.getByRole('dialog', { name: 'Search Studio' })).toBeInTheDocument();
});

it('leaves handled editor commands and extended shortcuts alone', () => {
  render(<GlobalSearch hasWorkspace={false} hasExploreContent={false} />);
  const handled = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true });
  handled.preventDefault();
  act(() => {
    window.dispatchEvent(handled);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, shiftKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, shiftKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, metaKey: true }));
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
