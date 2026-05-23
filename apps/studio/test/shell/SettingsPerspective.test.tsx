// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingsPerspective } from '../../src/shell/perspectives/screens/SettingsPerspective.js';

describe('SettingsPerspective', () => {
  it('renders the settings screen with an Appearance section (font scale)', () => {
    render(<SettingsPerspective />);
    expect(screen.getByTestId('settings-perspective')).toBeTruthy();
    // the font-scale control is surfaced here (reuse of FontScaleButton)
    expect(screen.getByRole('button', { name: /font size/i })).toBeTruthy();
  });
  it('shows a Project configuration section (forward-looking, .runestudio)', () => {
    render(<SettingsPerspective />);
    expect(screen.getByTestId('settings-project-section')).toBeTruthy();
  });
});
