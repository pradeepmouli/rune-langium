// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T037 — CuratedLoadErrorPanel renders a distinct, actionable message
 * for every FR-002 ErrorCategory. Never falls back to a generic
 * "unknown error" string.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CuratedLoadErrorPanel } from '../../src/components/CuratedLoadErrorPanel.js';
import type { ErrorCategory } from '../../src/services/curated-loader.js';

function renderPanel(category: ErrorCategory, onRetry = vi.fn()) {
  return {
    onRetry,
    ...render(<CuratedLoadErrorPanel category={category} modelName="CDM" onRetry={onRetry} />)
  };
}

describe('CuratedLoadErrorPanel (T037)', () => {
  it.each([
    ['network', /network|connection|offline/i],
    ['archive_not_found', /not (yet )?available|archive/i],
    ['archive_decode', /corrupt|decode|invalid/i],
    ['storage_quota', /storage|quota|space/i],
    ['permission_denied', /permission/i],
    ['cancelled', /cancel/i]
  ] as Array<[ErrorCategory, RegExp]>)(
    'renders a category-specific message for %s',
    (category, pattern) => {
      renderPanel(category);
      // The error text should be category-specific, not the literal "unknown".
      const body = document.body.textContent ?? '';
      expect(body).toMatch(pattern);
      expect(body).not.toMatch(/unknown error/i);
      expect(body).not.toMatch(/something went wrong/i);
    }
  );

  it('always exposes a retry button', () => {
    const { onRetry } = renderPanel('network');
    const retry = screen.getByRole('button', { name: /retry|try again/i });
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('mentions the model name so the user knows which load failed', () => {
    renderPanel('archive_not_found');
    expect(document.body.textContent).toMatch(/CDM/);
  });

  it('shows a recovery hint specific to storage_quota', () => {
    renderPanel('storage_quota');
    expect(document.body.textContent).toMatch(/free up|clear|remove/i);
  });

  it('falls back to a category-specific message for the unknown category', () => {
    renderPanel('unknown');
    // Even "unknown" must produce SOMETHING useful — not a literal placeholder.
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/unknown error/i);
    expect(text).toMatch(/unexpected/i);
  });
});
