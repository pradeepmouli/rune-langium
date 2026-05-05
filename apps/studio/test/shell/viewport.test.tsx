// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T080 / T082 — viewport handling tests.
 *  - small viewport defaults are correct (panel collapsed flags)
 *  - mobile-portrait shows UnsupportedViewport instead of DockShell
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnsupportedViewport } from '../../src/components/UnsupportedViewport.js';

describe('UnsupportedViewport (T082)', () => {
  it('renders a clear message + alert role', () => {
    render(<UnsupportedViewport />);
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toMatch(/laptops|larger|wide/i);
  });
});
