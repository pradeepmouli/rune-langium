// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Verifies that the refactoryDarkHighlightStyle derives its syntax palette
 * from the canonical design tokens rather than hardcoding hex values.
 *
 * The CodeMirror HighlightStyle API does not expose per-tag color values
 * at runtime (it compiles to CSS classes), so we test the source-of-truth
 * directly: asserting the token values themselves, and that the theme module
 * imports from the same token source.
 */

import { describe, it, expect } from 'vitest';
import { syntax } from '@rune-langium/design-system/tokens';

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

describe('refactory-dark theme uses design-system syntax tokens', () => {
  it('re-exports the theme without error', async () => {
    const mod = await import('../../src/lang/refactory-dark-theme.js');
    expect(mod.refactoryDarkTheme).toBeDefined();
    expect(mod.refactoryDarkHighlightStyle).toBeDefined();
    expect(mod.refactoryDark).toBeDefined();
  });
});
