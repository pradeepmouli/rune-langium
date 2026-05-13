// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for isOriginAllowed wildcard support (spec 019 Phase 1 follow-up).
 *
 * Single leading-wildcard form `https://*.example.com` is the only pattern
 * supported beyond exact match + the `*` escape hatch. Added so CF Pages
 * preview subdomains can be granted access in a single allowlist entry
 * without per-deploy dashboard touches.
 */

import { describe, expect, it } from 'vitest';
import { isOriginAllowed } from '../lib/lsp-auth.js';

describe('isOriginAllowed', () => {
  it('rejects when origin is null', () => {
    expect(isOriginAllowed(null, 'https://www.daikonic.dev')).toBe(false);
  });

  it('accepts any origin when allowed is "*"', () => {
    expect(isOriginAllowed('https://evil.example', '*')).toBe(true);
    expect(isOriginAllowed('https://www.daikonic.dev', '*')).toBe(true);
  });

  it('accepts exact-match single origin', () => {
    expect(isOriginAllowed('https://www.daikonic.dev', 'https://www.daikonic.dev')).toBe(true);
  });

  it('rejects non-matching exact origin', () => {
    expect(isOriginAllowed('https://evil.example', 'https://www.daikonic.dev')).toBe(false);
  });

  it('accepts when origin is one of the comma-separated entries', () => {
    const allowed = 'https://www.daikonic.dev, https://preview.daikonic.dev';
    expect(isOriginAllowed('https://preview.daikonic.dev', allowed)).toBe(true);
    expect(isOriginAllowed('https://www.daikonic.dev', allowed)).toBe(true);
    expect(isOriginAllowed('https://evil.example', allowed)).toBe(false);
  });

  it('wildcard form `https://*.daikonic-dev.pages.dev` matches preview subdomains', () => {
    const allowed = 'https://www.daikonic.dev, https://*.daikonic-dev.pages.dev';
    expect(isOriginAllowed('https://5d29507c.daikonic-dev.pages.dev', allowed)).toBe(true);
    expect(isOriginAllowed('https://019-studio-workers-pages-functions.daikonic-dev.pages.dev', allowed)).toBe(true);
  });

  it('wildcard form matches multi-label subdomains', () => {
    const allowed = 'https://*.daikonic-dev.pages.dev';
    expect(isOriginAllowed('https://preview.team.daikonic-dev.pages.dev', allowed)).toBe(true);
  });

  it('wildcard form does NOT match the bare suffix (must have a subdomain)', () => {
    const allowed = 'https://*.daikonic-dev.pages.dev';
    expect(isOriginAllowed('https://daikonic-dev.pages.dev', allowed)).toBe(false);
  });

  it('wildcard form does NOT match unrelated suffixes', () => {
    const allowed = 'https://*.daikonic-dev.pages.dev';
    // attacker-owned domain whose path coincidentally suffixes the allowlist target
    expect(isOriginAllowed('https://attacker.com', allowed)).toBe(false);
    // wrong scheme
    expect(isOriginAllowed('http://preview.daikonic-dev.pages.dev', allowed)).toBe(false);
    // suffix substring that doesn't fall on a label boundary — `xdaikonic-dev.pages.dev`
    // is a different domain even though it ends with the same string
    expect(isOriginAllowed('https://attackerxdaikonic-dev.pages.dev', allowed)).toBe(false);
  });

  it('non-wildcard pattern with leading `*` characters elsewhere does not match', () => {
    const allowed = 'https://prefix-*-suffix.example.com';
    expect(isOriginAllowed('https://prefix-foo-suffix.example.com', allowed)).toBe(false);
  });

  it('empty allowlist rejects everything', () => {
    expect(isOriginAllowed('https://www.daikonic.dev', '')).toBe(false);
    expect(isOriginAllowed('https://www.daikonic.dev', ', , ')).toBe(false);
  });
});
