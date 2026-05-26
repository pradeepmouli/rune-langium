// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GithubContext, type GithubContextValue } from '../../src/shell/providers/github-context.js';
import { SettingsPerspective } from '../../src/shell/perspectives/screens/SettingsPerspective.js';

const disconnectedCtx: GithubContextValue = {
  status: 'disconnected',
  connect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  disconnect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
};

function renderSettings() {
  return render(
    <GithubContext.Provider value={disconnectedCtx}>
      <SettingsPerspective />
    </GithubContext.Provider>
  );
}

describe('SettingsPerspective', () => {
  it('renders the settings screen with an Appearance section (font scale)', () => {
    renderSettings();
    expect(screen.getByTestId('settings-perspective')).toBeTruthy();
    // the font-scale control is surfaced here (reuse of FontScaleButton)
    expect(screen.getByRole('button', { name: /font size/i })).toBeTruthy();
  });
  it('shows a Project configuration section (forward-looking, .runestudio)', () => {
    renderSettings();
    expect(screen.getByTestId('settings-project-section')).toBeTruthy();
  });
});
