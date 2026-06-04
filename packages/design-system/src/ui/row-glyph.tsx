// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import * as React from 'react';

import { cn } from '../utils';

/**
 * RowGlyph — the small 16×16 glyph affordance used in dense structure-view
 * rows: a navigation arrow, an enum-jump arrow, or an unresolved-type marker.
 *
 * Component-override convention (tier 2): the whole thing lives in the
 * component — no rule in the visual-editor's global `styles.css`, no co-located
 * CSS file. Each variant's composite surface (the `color-mix` tints / hover
 * flips that a utility can't express) is declared as component CSS variables
 * here, then consumed by arbitrary `var()` utilities — the Tailwind v4 "CSS
 * custom properties in the component" pattern. Layout + type are plain utilities
 * consuming the design tokens.
 *
 * The vars compose from design tokens (`--muted`, `--border`, `--destructive`,
 * `--color-enum-text`, …) so theming still flows through, and a consumer can
 * override any of them via `style`.
 *
 * Polymorphic by design: the nav/enum-nav variants are interactive `<button>`s
 * while the unresolved marker is a static `<span>`, so the rendered element is
 * chosen via `as` and the caller's props (`onClick`, `type`, `title`,
 * `data-testid`, `role`, …) pass straight through.
 */
export type RowGlyphVariant = 'nav' | 'enum-nav' | 'unresolved';

/**
 * Per-variant composite surfaces. Each block is the set of `color-mix` fills /
 * borders that have no utility form — the tier-3 escape hatch. The base
 * utilities below read `--row-glyph-bg` / `--row-glyph-fg` etc. so the variant
 * is expressed purely as a CSS-var swap.
 */
const variantVars: Record<RowGlyphVariant, React.CSSProperties> = {
  // Inspector / type-reference navigation arrow — muted tinted box with a hover
  // lift. Interactive.
  nav: {
    '--row-glyph-bg': 'color-mix(in oklch, var(--muted) 32%, transparent)',
    '--row-glyph-bg-hover': 'color-mix(in oklch, var(--muted) 64%, transparent)',
    '--row-glyph-fg': 'var(--muted-foreground)',
    '--row-glyph-fg-hover': 'var(--foreground)',
    '--row-glyph-border': 'color-mix(in oklch, var(--border) 55%, transparent)',
    '--row-glyph-border-hover': 'color-mix(in oklch, var(--border) 85%, transparent)',
  } as React.CSSProperties,
  // Enum-jump (↗) arrow — transparent box tinted with the enum palette.
  // Interactive.
  'enum-nav': {
    '--row-glyph-bg': 'transparent',
    '--row-glyph-bg-hover': 'color-mix(in oklch, var(--color-enum-text) 20%, transparent)',
    '--row-glyph-fg': 'var(--color-enum-text)',
    '--row-glyph-fg-hover': 'var(--foreground)',
    '--row-glyph-border': 'transparent',
    '--row-glyph-border-hover': 'transparent',
  } as React.CSSProperties,
  // Unresolved-type (?) indicator — destructive tint, no hover. Static marker.
  unresolved: {
    '--row-glyph-bg': 'color-mix(in oklch, var(--destructive) 14%, transparent)',
    '--row-glyph-bg-hover': 'color-mix(in oklch, var(--destructive) 14%, transparent)',
    '--row-glyph-fg': 'var(--destructive)',
    '--row-glyph-fg-hover': 'var(--destructive)',
    '--row-glyph-border': 'transparent',
    '--row-glyph-border-hover': 'transparent',
  } as React.CSSProperties,
};

type RowGlyphOwnProps = {
  variant: RowGlyphVariant;
};

export type RowGlyphProps<E extends React.ElementType = 'span'> = RowGlyphOwnProps & {
  as?: E;
} & Omit<React.ComponentPropsWithoutRef<E>, keyof RowGlyphOwnProps | 'as'>;

export function RowGlyph<E extends React.ElementType = 'span'>({
  as,
  variant,
  className,
  style,
  ...props
}: RowGlyphProps<E>) {
  const Component = (as ?? 'span') as React.ElementType;
  return (
    <Component
      data-slot="row-glyph"
      data-variant={variant}
      style={{ ...variantVars[variant], ...(style as React.CSSProperties) }}
      className={cn(
        // Base box + type — plain utilities consuming the design tokens. The
        // `nav` variant reads one radius rung larger so the inspector arrow
        // matches its surrounding chip pill; the canvas variants stay `xs`.
        'inline-flex h-4 w-4 shrink-0 items-center justify-center text-xs leading-none',
        variant === 'nav' ? 'rounded-sm' : 'rounded-xs',
        // Composite surface, consumed from the variant vars above. Borders use a
        // 1px box (the `nav` variant draws a visible border; the others keep it
        // transparent), with a `motion-fast` colour transition on the flips.
        'border border-(color:--row-glyph-border) bg-(--row-glyph-bg) text-(color:--row-glyph-fg)',
        // `--motion-fast` is a full `<duration> <timing>` pair (e.g. `140ms ease`),
        // so it goes in the `transition` shorthand per property — not `duration-*`,
        // which expects a bare duration.
        'transition-[color_var(--motion-fast),background-color_var(--motion-fast),border-color_var(--motion-fast)]',
        // Hover flips: only the interactive variants are reachable here; the
        // static `unresolved` marker resolves its hover vars to the rest state.
        'hover:border-(color:--row-glyph-border-hover) hover:bg-(--row-glyph-bg-hover) hover:text-(color:--row-glyph-fg-hover)',
        // Per-variant rest-state details that aren't part of the surface swap:
        // the interactive variants get a pointer + focus ring; the static
        // `unresolved` marker is non-interactive and renders its `?` bold.
        variant === 'unresolved'
          ? 'cursor-default font-semibold'
          : // `disabled:cursor-not-allowed` is explicit because the global
            // `:where(:disabled,…){cursor:not-allowed}` baseline is specificity-0
            // and would otherwise lose to this `cursor-pointer` utility.
            'cursor-pointer disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(color:--primary)',
        className
      )}
      {...props}
    />
  );
}
