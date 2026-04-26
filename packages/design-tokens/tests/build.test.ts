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
const BRAND_OUT = resolve(ROOT, 'dist/brand.css');

describe('@rune-langium/design-tokens build (T024)', () => {
  beforeAll(() => {
    execSync('npx --no-install tsx src/build.ts', { cwd: ROOT, stdio: 'inherit' });
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

  // T051 (014/Phase-8) — verify the new cross-surface namespaces emit
  // through the existing flatten/emitTs/emitDts paths, plus the new
  // dist/brand.css subset.
  it('emits the cross-surface token namespaces in tokens.css (T049)', () => {
    const css = readFileSync(CSS_OUT, 'utf8');
    // Typography
    expect(css).toMatch(/--font-display:/);
    expect(css).toMatch(/--font-mono:/);
    // Spacing scale (FR-025 fix)
    expect(css).toMatch(/--space-1:\s*4px/);
    expect(css).toMatch(/--space-4:\s*16px/);
    expect(css).toMatch(/--space-10:\s*40px/);
    // Text scale
    expect(css).toMatch(/--text-md:\s*0\.9375rem/);
    // Sidebar widths
    expect(css).toMatch(/--sidebar-width-default:\s*280px/);
    expect(css).toMatch(/--sidebar-width-min:\s*220px/);
    expect(css).toMatch(/--sidebar-width-max:\s*360px/);
    // Syntax palette
    expect(css).toMatch(/--syntax-keyword:\s*#C792EA/);
    expect(css).toMatch(/--syntax-string:/);
    expect(css).toMatch(/--syntax-comment:/);
    expect(css).toMatch(/--syntax-function:/);
    expect(css).toMatch(/--syntax-operator:/);
    expect(css).toMatch(/--syntax-constant:/);
    expect(css).toMatch(/--syntax-variable:/);
    // Radius / button / focus / brand
    expect(css).toMatch(/--radius-md:\s*8px/);
    expect(css).toMatch(/--button-height:\s*40px/);
    expect(css).toMatch(/--focus-ring-width:\s*2px/);
    expect(css).toMatch(/--focus-ring-offset:\s*2px/);
    expect(css).toMatch(/--focus-ring-colour:/);
    expect(css).toMatch(/--brand-mark-size:\s*28px/);
    expect(css).toMatch(/--brand-mark-radius:\s*6px/);
    expect(css).toMatch(/--brand-mark-border-width:\s*2px/);
  });

  it('emits dist/brand.css with the brand subset (T050)', () => {
    const brand = readFileSync(BRAND_OUT, 'utf8');
    expect(brand).toMatch(/--color-accent-base:/);
    expect(brand).toMatch(/--font-display:/);
    expect(brand).toMatch(/--syntax-keyword:/);
    expect(brand).toMatch(/--radius-md:/);
    expect(brand).toMatch(/--focus-ring-width:/);
    expect(brand).toMatch(/--brand-mark-size:/);
    // Brand subset MUST NOT carry the heavyweight Studio-only namespaces.
    expect(brand).not.toMatch(/--space-1:/);
    expect(brand).not.toMatch(/--sidebar-width-default:/);
    expect(brand).not.toMatch(/--text-md:/);
    expect(brand).not.toMatch(/--motion-duration-/);
    expect(brand).not.toMatch(/--z-index-/);
    expect(brand).not.toMatch(/--shadow-/);
  });

  it('extends the typed Tokens interface with the new key paths (T051)', () => {
    const dts = readFileSync(DTS_OUT, 'utf8');
    expect(dts).toMatch(/readonly display:/);
    expect(dts).toMatch(/readonly space:/);
    expect(dts).toMatch(/readonly text:/);
    expect(dts).toMatch(/readonly sidebar:/);
    expect(dts).toMatch(/readonly syntax:/);
    expect(dts).toMatch(/readonly focus:/);
    expect(dts).toMatch(/readonly brand:/);
  });
});
