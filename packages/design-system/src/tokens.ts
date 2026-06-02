// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Rune DSL Design System — TypeScript token exports.
 *
 * These match the CSS custom properties in theme.css (Daikon palette).
 * Use for JS-side color references (e.g., ReactFlow config, chart colors).
 */

import canonicalTokens from '@rune-langium/design-tokens/tokens.json' with { type: 'json' };

const palette = canonicalTokens.color;

export const colors = {
  data: {
    DEFAULT: palette.kind.data.base,
    bg: palette.kind.data.bg,
    text: palette.kind.data.text,
    badge: palette.kind.data.badge
  },
  choice: {
    DEFAULT: palette.kind.choice.base,
    bg: palette.kind.choice.bg,
    text: palette.kind.choice.text,
    badge: palette.kind.choice.badge
  },
  enum: {
    DEFAULT: palette.kind.enum.base,
    bg: palette.kind.enum.bg,
    text: palette.kind.enum.text,
    badge: palette.kind.enum.badge
  },
  func: {
    DEFAULT: palette.kind.func.base,
    bg: palette.kind.func.bg,
    text: palette.kind.func.text,
    badge: palette.kind.func.badge
  },
  edge: {
    ref: palette.kind.edge.ref
  },
  status: {
    success: palette.status.success,
    warning: palette.status.warning,
    error: palette.status.error,
    info: palette.status.info
  },
  expr: {
    arithmetic: { DEFAULT: palette.expr.arithmetic.base, bg: palette.expr.arithmetic.bg },
    comparison: { DEFAULT: palette.expr.comparison.base, bg: palette.expr.comparison.bg },
    logic: { DEFAULT: palette.expr.logic.base, bg: palette.expr.logic.bg },
    navigation: { DEFAULT: palette.expr.navigation.base, bg: palette.expr.navigation.bg },
    collection: { DEFAULT: palette.expr.collection.base, bg: palette.expr.collection.bg },
    control: { DEFAULT: palette.expr.control.base, bg: palette.expr.control.bg },
    literal: { DEFAULT: palette.expr.literal.base, bg: palette.expr.literal.bg },
    reference: { DEFAULT: palette.expr.reference.base, bg: palette.expr.reference.bg },
    placeholder: { DEFAULT: palette.expr.placeholder.base, bg: palette.expr.placeholder.bg }
  }
} as const;

export const fonts = {
  display: canonicalTokens.font.display,
  sans: canonicalTokens.font.family.sans,
  mono: canonicalTokens.font.mono
} as const;

export const radii = {
  sm: canonicalTokens.radius.sm,
  md: canonicalTokens.radius.md,
  lg: canonicalTokens.radius.lg
} as const;

export const syntax = {
  keyword: canonicalTokens.syntax.keyword,
  type: canonicalTokens.syntax.type,
  attribute: canonicalTokens.syntax.attribute,
  string: canonicalTokens.syntax.string,
  comment: canonicalTokens.syntax.comment,
  number: canonicalTokens.syntax.number,
  function: canonicalTokens.syntax.function,
  operator: canonicalTokens.syntax.operator,
  constant: canonicalTokens.syntax.constant,
  variable: canonicalTokens.syntax.variable
} as const;

export type Colors = typeof colors;
export type Fonts = typeof fonts;
export type Syntax = typeof syntax;
