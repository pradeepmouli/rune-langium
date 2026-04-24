// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

const origin = typeof window === 'undefined' ? '' : window.location.origin;

export const studioConfig = {
  homeUrl: import.meta.env.VITE_HOME_URL || `${origin}/`,
  docsUrl: import.meta.env.VITE_DOCS_URL || `${origin}/docs/`,
  githubUrl: import.meta.env.VITE_GITHUB_URL || 'https://github.com/pradeepmouli/rune-langium'
};
