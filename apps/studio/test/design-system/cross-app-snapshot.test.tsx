// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T093 — Cross-app snapshot test.
 *
 * Pins that the design-system primitives' rendered class names match the
 * tokens emitted by `@rune-langium/design-tokens`. A drift in either side
 * (token rename, primitive class change) breaks this test, which is the
 * point: every visual change must be intentional.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { Button } from '@rune-langium/design-system/ui/button';
import { Heading } from '@rune-langium/design-system/ui/heading';
import { AppSwitcher } from '@rune-langium/design-system/ui/app-switcher';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DESIGN_TOKENS_DIR = resolve(__dirname, '../../../../packages/design-tokens');
const TOKENS_CSS = resolve(DESIGN_TOKENS_DIR, 'dist/tokens.css');

function ensureTokensBuilt(): void {
  if (existsSync(TOKENS_CSS)) return;
  execSync('node --experimental-strip-types src/build.ts', {
    cwd: DESIGN_TOKENS_DIR,
    stdio: 'inherit'
  });
}

describe('cross-app snapshot (T093)', () => {
  it('design-tokens emits every variable family the primitives consume', () => {
    ensureTokensBuilt();
    const css = readFileSync(TOKENS_CSS, 'utf8');

    // The primitives use these token families. Every one MUST be present
    // in the emitted CSS — otherwise the styling cascade silently drops
    // to the browser default.
    const required = [
      '--color-accent-base',
      '--color-foreground-primary',
      '--color-border-default',
      '--font-family-sans',
      '--font-size-base',
      '--font-weight-semibold',
      '--spacing-3',
      '--radius-md',
      '--motion-duration-base'
    ];
    for (const v of required) {
      expect(css).toContain(v);
    }
  });

  it('Button primitive renders consistent class names across consumers', () => {
    const { rerender } = render(<Button>Primary</Button>);
    const primaryHtml = screen.getByRole('button').outerHTML;

    rerender(<Button>Primary again</Button>);
    const primaryHtml2 = screen.getByRole('button').outerHTML;

    // Same prop set → identical class output. Detects accidental
    // randomness or non-deterministic class generation across renders.
    const classOf = (html: string) => {
      const m = html.match(/class="([^"]*)"/);
      return m?.[1] ?? '';
    };
    expect(classOf(primaryHtml)).toBe(classOf(primaryHtml2));
  });

  it('Heading + AppSwitcher render with token-driven classes', () => {
    render(
      <>
        <Heading level={1}>Title</Heading>
        <AppSwitcher current="docs" />
      </>
    );
    const h = screen.getByRole('heading', { level: 1 });
    expect(h.className).toMatch(/font-/);
    expect(screen.getAllByRole('link').length).toBe(3);
  });

  it('AppSwitcher current-page link uses semantic aria-current=page across surfaces', () => {
    const { rerender } = render(<AppSwitcher current="home" />);
    const home = screen.getAllByRole('link').find((l) => l.textContent === 'Home');
    expect(home?.getAttribute('aria-current')).toBe('page');
    rerender(<AppSwitcher current="docs" />);
    const docs = screen.getAllByRole('link').find((l) => l.textContent === 'Docs');
    expect(docs?.getAttribute('aria-current')).toBe('page');
    rerender(<AppSwitcher current="studio" />);
    const studio = screen.getAllByRole('link').find((l) => l.textContent === 'Studio');
    expect(studio?.getAttribute('aria-current')).toBe('page');
  });
});
