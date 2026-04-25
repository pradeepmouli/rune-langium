// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * T024 — design-tokens build snapshot tests.
 * Asserts the emitted CSS contains every required variable family from the
 * locked namespaces in data-model §5.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CSS_OUT = resolve(ROOT, 'dist/tokens.css');
const JS_OUT = resolve(ROOT, 'dist/tokens.js');
const DTS_OUT = resolve(ROOT, 'dist/tokens.d.ts');

describe('@rune-langium/design-tokens build (T024)', () => {
  beforeAll(() => {
    execSync('node --experimental-strip-types src/build.ts', { cwd: ROOT, stdio: 'inherit' });
  });

  it('emits dist/tokens.css containing each locked variable family', () => {
    const css = readFileSync(CSS_OUT, 'utf8');

    // Color
    expect(css).toMatch(/--color-surface-1:/);
    expect(css).toMatch(/--color-foreground-primary:/);
    expect(css).toMatch(/--color-accent-base:/);
    expect(css).toMatch(/--color-danger-base:/);
    expect(css).toMatch(/--color-warning-base:/);
    expect(css).toMatch(/--color-success-base:/);
    expect(css).toMatch(/--color-border-default:/);

    // Typography
    expect(css).toMatch(/--font-family-sans:/);
    expect(css).toMatch(/--font-family-mono:/);
    expect(css).toMatch(/--font-size-base:/);
    expect(css).toMatch(/--font-weight-semibold:/);

    // Layout primitives
    expect(css).toMatch(/--spacing-4:/);
    expect(css).toMatch(/--radius-md:/);
    expect(css).toMatch(/--shadow-md:/);

    // Motion + z-index
    expect(css).toMatch(/--motion-duration-base:/);
    expect(css).toMatch(/--motion-easing-standard:/);
    expect(css).toMatch(/--z-index-modal:/);
  });

  it('emits a [data-theme="dark"] block that overrides only color', () => {
    const css = readFileSync(CSS_OUT, 'utf8');
    const darkBlock = css.split('[data-theme="dark"]')[1] ?? '';
    expect(darkBlock).toMatch(/--color-surface-1:/);
    expect(darkBlock).toMatch(/--color-foreground-primary:/);
    // Dark must NOT redefine non-color tokens.
    expect(darkBlock).not.toMatch(/--spacing-/);
    expect(darkBlock).not.toMatch(/--radius-/);
    expect(darkBlock).not.toMatch(/--font-family-/);
  });

  it('emits dist/tokens.js with a typed `tokens` export', () => {
    const js = readFileSync(JS_OUT, 'utf8');
    expect(js).toMatch(/export const tokens =/);
    expect(js).toMatch(/as const/);
  });

  it('emits dist/tokens.d.ts with a fully-typed Tokens interface (not Record<string, unknown>)', () => {
    const dts = readFileSync(DTS_OUT, 'utf8');
    // The interface must declare specific known token paths, not be a generic record.
    expect(dts).toMatch(/export interface Tokens \{/);
    expect(dts).toMatch(/readonly color:/);
    expect(dts).not.toMatch(/Record<string, unknown>/);
    // A misspelled-token regression would surface as a missing property.
    // Spot-check a few well-known nested paths exist as readonly properties.
    expect(dts).toMatch(/readonly surface:/);
    expect(dts).toMatch(/readonly spacing:/);
    expect(dts).toMatch(/readonly motion:/);
  });
});
