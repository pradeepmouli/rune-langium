// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
/** Base URL for the github-auth worker routes (device-init / device-poll / user). */
export function getGitHubAuthBase(): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/rune-studio/api/github-auth`;
}
