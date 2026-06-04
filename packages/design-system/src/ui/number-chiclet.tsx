// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import * as React from 'react';

import { cn } from '../utils';

/**
 * Small monospace count badge — e.g. the "3" next to a namespace or dock tab.
 *
 * Pilot for the component-override convention (tier 2): the whole thing lives in
 * the component — no rule in the studio's global `app.css`, no co-located CSS
 * file. The composite surface (gradient / color-mix fills that a utility can't
 * express) is declared as component CSS variables right here, then consumed by
 * arbitrary `var()` utilities — the Tailwind v4 "CSS custom properties in the
 * component" pattern. Layout + type are plain utilities consuming the tokens.
 *
 * The vars compose from design tokens (`--muted`, `--background`, …) so theming
 * still flows through, and a consumer can override any of them via `style`.
 *
 * Type uses the named `font-mono` / `text-2xs` utilities (the brand mono stack
 * and the 11px scale rung, both wired through Tailwind's `@theme`); the composite
 * surface keeps arbitrary `var()` because a gradient / color-mix fill has no
 * utility form — that's exactly the tier-3 escape hatch.
 */
const surfaceVars = {
  '--chiclet-bg':
    'linear-gradient(180deg, color-mix(in srgb, var(--muted) 88%, transparent), color-mix(in srgb, var(--background) 76%, transparent))',
  '--chiclet-fg': 'color-mix(in srgb, var(--muted-foreground) 92%, white 8%)',
  '--chiclet-border': 'color-mix(in srgb, var(--border) 86%, transparent)',
  '--chiclet-shadow': 'inset 0 1px 0 color-mix(in srgb, white 9%, transparent)',
} as React.CSSProperties;

export function NumberChiclet({ className, style, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="number-chiclet"
      style={{ ...surfaceVars, ...style }}
      className={cn(
        'inline-flex items-center justify-center min-w-[22px] h-[18px] px-2 rounded-lg',
        'font-mono text-2xs font-medium tabular-nums leading-none whitespace-nowrap shrink-0',
        // composite surface, consumed from the component vars above:
        'bg-[var(--chiclet-bg)] text-[color:var(--chiclet-fg)] border-[0.5px] border-[color:var(--chiclet-border)] shadow-[var(--chiclet-shadow)]',
        className
      )}
      {...props}
    />
  );
}
