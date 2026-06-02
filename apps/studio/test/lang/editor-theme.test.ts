// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Verifies that the studioEditorHighlightStyle derives its syntax palette
 * from the canonical design tokens rather than hardcoding hex values.
 *
 * The CodeMirror HighlightStyle API does not expose per-tag color values
 * at runtime (it compiles to CSS classes), so we test the source-of-truth
 * directly: asserting the token values themselves, and that the theme module
 * imports from the same token source.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { syntax } from '@rune-langium/design-system/tokens';

/** The theme module source — used to assert it references the syntax tokens
 * (rather than hardcoded hex), since the compiled HighlightStyle doesn't
 * expose per-tag colors at runtime. */
const THEME_SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../src/lang/editor-theme.ts'),
  'utf8'
);

describe('design-system syntax tokens (canonical values)', () => {
  it('syntax.keyword is #C792EA', () => {
    expect(syntax.keyword).toBe('#C792EA');
  });

  it('syntax.function is #82AAFF', () => {
    expect(syntax.function).toBe('#82AAFF');
  });

  it('syntax.attribute is #82AAFF', () => {
    expect(syntax.attribute).toBe('#82AAFF');
  });

  it('syntax.type is #00D4AA', () => {
    expect(syntax.type).toBe('#00D4AA');
  });

  it('syntax.operator is #8A8A96', () => {
    expect(syntax.operator).toBe('#8A8A96');
  });

  it('syntax.comment is #5C5C6A', () => {
    expect(syntax.comment).toBe('#5C5C6A');
  });

  it('syntax.constant is #E8913A', () => {
    expect(syntax.constant).toBe('#E8913A');
  });

  it('syntax.number is #E8913A', () => {
    expect(syntax.number).toBe('#E8913A');
  });

  it('syntax.string is #C3E88D', () => {
    expect(syntax.string).toBe('#C3E88D');
  });

  it('syntax.variable is #00D4AA', () => {
    expect(syntax.variable).toBe('#00D4AA');
  });
});

describe('studio editor theme uses design-system syntax tokens', () => {
  it('re-exports the theme without error', async () => {
    const mod = await import('../../src/lang/editor-theme.js');
    expect(mod.studioEditorTheme).toBeDefined();
    expect(mod.studioEditorHighlightStyle).toBeDefined();
    expect(mod.studioEditorExtensions).toBeDefined();
  });

  // Source-level: the HighlightStyle rules must reference a syntax.* token for
  // every remapped tag (proves the theme USES the tokens, not just that they
  // exist — the compiled style hides colors at runtime).
  it('references a syntax.* token for each remapped highlight tag', () => {
    for (const key of [
      'keyword', 'type', 'attribute', 'string', 'comment', 'number', 'function', 'operator', 'constant'
    ] as const) {
      expect(THEME_SRC).toContain(`syntax.${key}`);
    }
  });

  // Anti-regression: #C792EA (keyword) and #C3E88D (string) are unique to the
  // syntax palette; if either reappears as a literal, someone reverted to
  // hardcoded hex.
  it('does not reintroduce the hardcoded syntax hex it replaced', () => {
    expect(THEME_SRC).not.toMatch(/#C792EA/i);
    expect(THEME_SRC).not.toMatch(/#C3E88D/i);
  });

  // Chrome anti-regression: the legacy surface hex must be gone from
  // the EditorView.theme({}) block; all chrome colors must now use var(--*)
  // or color-mix() so the editor adapts to the active theme (daikonic).
  it('does not contain the legacy background hex in the chrome', () => {
    expect(THEME_SRC).not.toMatch(/#0C0C14/i);
    expect(THEME_SRC).not.toMatch(/#181824/i);
    expect(THEME_SRC).not.toMatch(/#12121C/i);
  });

  // The line-number gutter is a sibling of .cm-content and does NOT inherit
  // its font, so it must set the mono font itself — otherwise line numbers
  // fall back to the body UI font (Inter) and render proportional/misaligned.
  it('the .cm-gutters block sets the mono font', () => {
    expect(THEME_SRC).toMatch(/'\.cm-gutters':\s*\{[\s\S]*?font-mono/);
  });

  // Only use tokens defined in the BASE palette so the theme resolves under
  // every theme (incl. ?theme=default). --color-error is daikonic-only — use
  // --destructive (base + per-theme) instead.
  it('does not use daikonic-only tokens (e.g. --color-error)', () => {
    expect(THEME_SRC).not.toMatch(/var\(--color-error\)/);
  });
});
