// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GithubContext, type GithubContextValue } from '../../src/shell/providers/github-context.js';
import { SettingsPerspective } from '../../src/shell/perspectives/screens/SettingsPerspective.js';

function renderWith(value: Partial<GithubContextValue>) {
  const full: GithubContextValue = {
    status: 'disconnected',
    connect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    disconnect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    ...value,
  } as GithubContextValue;
  render(
    <GithubContext.Provider value={full}>
      <SettingsPerspective />
    </GithubContext.Provider>
  );
  return full;
}

describe('SettingsPerspective — GitHub account section', () => {
  it('shows a "Connect GitHub" button when disconnected; clicking calls connect()', () => {
    const fake = renderWith({ status: 'disconnected' });
    const btn = screen.getByRole('button', { name: /connect github/i });
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(fake.connect).toHaveBeenCalledOnce();
  });

  it('shows @login and a Disconnect button when connected; clicking calls disconnect()', () => {
    const fake = renderWith({
      status: 'connected',
      user: { login: 'octocat', avatarUrl: 'https://github.com/octocat.png' },
    });
    expect(screen.getByText(/octocat/)).toBeTruthy();
    const btn = screen.getByRole('button', { name: /disconnect/i });
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(fake.disconnect).toHaveBeenCalledOnce();
  });

  it('shows the error message when status is error', () => {
    renderWith({ status: 'error', error: 'Token expired' });
    expect(screen.getByText(/token expired/i)).toBeTruthy();
  });

  it('renders the categorised plain-English copy when an errorCategory is present', () => {
    // Spec §8: the Settings error state shows the same plain-English copy the
    // dialog renders (categoryCopy), not the raw `HTTP 5xx` reason.
    renderWith({ status: 'error', error: 'HTTP 502', errorCategory: 'misconfigured' });
    expect(screen.getByText(/GitHub authorisation is not yet available/i)).toBeTruthy();
    expect(screen.queryByText(/HTTP 502/)).toBeNull();
  });
});
