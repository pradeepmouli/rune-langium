// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Rune DSL Design System — TypeScript token exports.
 *
 * JS-side color/font/radius references (ReactFlow config, chart colors) that
 * cannot read CSS `@theme`/`var(--*)` at runtime, so they need literal values
 * here. These are the SAME COLORS as the `tokens.css` primitive layer, kept in
 * the sRGB hex/rgba notation JS consumers expect — `tokens.css` expresses the
 * same colors as `oklch()` for the CSS side. This sRGB↔oklch split is the one
 * irreducible bit of duplication a CSS-first token source leaves; keep the two
 * in sync by hand (values rarely change; the daikonic theme retunes via CSS).
 *
 * Formerly derived from `@rune-langium/design-tokens/tokens.json` (package
 * retired).
 */

export const colors = {
  data: {
    DEFAULT: '#00D4AA',
    bg: 'rgba(0, 212, 170, 0.12)',
    text: '#00D4AA',
    badge: 'rgba(0, 212, 170, 0.20)'
  },
  choice: {
    DEFAULT: '#E8913A',
    bg: 'rgba(232, 145, 58, 0.12)',
    text: '#E8913A',
    badge: 'rgba(232, 145, 58, 0.20)'
  },
  enum: {
    DEFAULT: '#8B7BF4',
    bg: 'rgba(139, 123, 244, 0.12)',
    text: '#8B7BF4',
    badge: 'rgba(139, 123, 244, 0.20)'
  },
  func: {
    DEFAULT: '#82AAFF',
    bg: 'rgba(130, 170, 255, 0.12)',
    text: '#82AAFF',
    badge: 'rgba(130, 170, 255, 0.20)'
  },
  edge: {
    ref: '#5C5C6A'
  },
  status: {
    success: '#00D4AA',
    warning: '#E8913A',
    error: '#FF6058',
    info: '#82AAFF'
  },
  expr: {
    arithmetic: { DEFAULT: '#82AAFF', bg: 'rgba(130, 170, 255, 0.12)' },
    comparison: { DEFAULT: '#00D4AA', bg: 'rgba(0, 212, 170, 0.12)' },
    logic: { DEFAULT: '#C792EA', bg: 'rgba(199, 146, 234, 0.12)' },
    navigation: { DEFAULT: '#00D4AA', bg: 'rgba(0, 212, 170, 0.12)' },
    collection: { DEFAULT: '#E8913A', bg: 'rgba(232, 145, 58, 0.12)' },
    control: { DEFAULT: '#C792EA', bg: 'rgba(199, 146, 234, 0.12)' },
    literal: { DEFAULT: '#8A8A96', bg: 'rgba(138, 138, 150, 0.12)' },
    reference: { DEFAULT: '#8B7BF4', bg: 'rgba(139, 123, 244, 0.12)' },
    placeholder: { DEFAULT: '#5C5C6A', bg: 'rgba(92, 92, 106, 0.10)' }
  }
} as const;

export const fonts = {
  display: "'Outfit', system-ui, sans-serif",
  sans: 'Inter, system-ui, -apple-system, sans-serif',
  mono: "'JetBrains Mono', ui-monospace, monospace"
} as const;

// Mirrors the CSS radius ladder (theme.css `@theme inline`, the single source)
// at the default `--radius: 8px`: sm = --radius-4 = 4px, md = --radius-2 = 6px,
// lg = --radius = 8px. Static JS mirror — update if the `--radius` knob changes.
export const radii = {
  sm: '4px',
  md: '6px',
  lg: '8px'
} as const;

export const syntax = {
  keyword: '#C792EA',
  type: '#00D4AA',
  attribute: '#82AAFF',
  string: '#C3E88D',
  comment: '#5C5C6A',
  number: '#E8913A',
  function: '#82AAFF',
  operator: '#8A8A96',
  constant: '#E8913A',
  variable: '#00D4AA'
} as const;

export type Colors = typeof colors;
export type Fonts = typeof fonts;
export type Syntax = typeof syntax;
