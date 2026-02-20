/**
 * Rune DSL Design System — TypeScript token exports.
 *
 * These match the CSS custom properties in theme.css.
 * Use for JS-side color references (e.g., ReactFlow config, chart colors).
 */

export const colors = {
  data: {
    DEFAULT: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.15)',
    text: '#93c5fd',
    badge: 'rgba(59, 130, 246, 0.25)'
  },
  choice: {
    DEFAULT: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.15)',
    text: '#fcd34d',
    badge: 'rgba(245, 158, 11, 0.25)'
  },
  enum: {
    DEFAULT: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.15)',
    text: '#86efac',
    badge: 'rgba(34, 197, 94, 0.25)'
  },
  func: {
    DEFAULT: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.15)',
    text: '#d8b4fe',
    badge: 'rgba(168, 85, 247, 0.25)'
  },
  edge: {
    ref: '#94a3b8'
  },
  status: {
    success: '#4ade80',
    warning: '#fbbf24',
    error: '#f87171',
    info: '#38bdf8'
  }
} as const;

export const fonts = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace'
} as const;

export const radii = {
  sm: '3px',
  md: '4px',
  lg: '6px'
} as const;

export type Colors = typeof colors;
export type Fonts = typeof fonts;
