// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type { GitHubAuthErrorCategory } from './github-auth.js';

/**
 * User-facing copy per error category (FR-006 / EC-6). Surfaces the
 * github-auth Worker's structured failures as plain English instead of a raw
 * `HTTP 5xx` string. Shared by every consumer of `useGithub().error`
 * (GitHubConnectDialog, SettingsPerspective) so error presentation is uniform.
 *
 * Kept in its own module (not github-auth.ts) so tests that mock the
 * device-flow client do not also have to re-stub this pure copy helper.
 */
export function categoryCopy(
  category: GitHubAuthErrorCategory | undefined,
  fallback: string
): string {
  switch (category) {
    case 'misconfigured':
      return 'GitHub authorisation is not yet available — please come back later.';
    case 'unavailable':
      return 'GitHub appears to be down — please retry shortly.';
    case 'origin_blocked':
      return 'Studio configuration error — contact support.';
    case 'unknown':
    default:
      return `Connection failed: ${fallback}`;
  }
}
