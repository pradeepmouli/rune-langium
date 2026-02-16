/**
 * Rune DSL Design System — TypeScript token exports.
 *
 * These match the CSS custom properties in theme.css.
 * Use for JS-side color references (e.g., ReactFlow config, chart colors).
 */

export const colors = {
  surface: {
    base: '#0f172a',
    raised: '#1e293b',
    overlay: '#334155',
    sunken: '#020617'
  },
  border: {
    default: '#334155',
    muted: '#1e293b',
    emphasis: '#475569'
  },
  text: {
    primary: '#e2e8f0',
    heading: '#f1f5f9',
    secondary: '#94a3b8',
    muted: '#64748b'
  },
  accent: {
    DEFAULT: '#3b82f6',
    hover: '#2563eb',
    muted: 'rgba(59, 130, 246, 0.15)',
    text: '#93c5fd'
  },
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
  status: {
    success: '#4ade80',
    warning: '#fbbf24',
    error: '#f87171',
    errorBg: 'rgba(239, 68, 68, 0.1)',
    errorText: '#fca5a5',
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
