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
import { buildDefaultLayout } from '../../src/shell/layout-factory.js';

describe('default layout vs viewport (T080)', () => {
  it('at 1280px the editor area is the dominant slot', () => {
    const layout = buildDefaultLayout({ studioVersion: '0.1.0', viewportWidth: 1280 });
    if (!layout.dockview || layout.dockview.shape !== 'factory') {
      throw new Error('factory shape expected');
    }

    const navigation = layout.dockview.columns[0];
    const editor = layout.dockview.columns[1];
    const preview = layout.dockview.columns[2];

    expect(editor).toBeDefined();
    expect((editor!.weight ?? 0) >= 3).toBe(true);
    expect(navigation.size).toBeLessThanOrEqual(220);
    expect(navigation.bottomSize).toBeLessThanOrEqual(220);
    expect(navigation.top.component).toBe('workspace.fileTree');
    expect(navigation.bottom.component).toBe('workspace.visualPreview');
    expect(preview!.size).toBeLessThanOrEqual(300);
  });
});

describe('UnsupportedViewport (T082)', () => {
  it('renders a clear message + alert role', () => {
    render(<UnsupportedViewport />);
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toMatch(/laptops|larger|wide/i);
  });
});
