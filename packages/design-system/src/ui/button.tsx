// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cloneElementWithMergedClassName, cn } from '../utils';

const buttonVariants = cva(
  // T058 (014/FR-026) — focus-visible normalised to a single
  // 2px outline + 2px offset using --ring (token-driven). Was
  // `focus-visible:ring-[3px]` which diverged from Studio's
  // hand-rolled `outline: 2px solid` rules elsewhere; now every
  // surface (button, input, namespace explorer) shares the spec.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ring) aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-primary-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
        // T054 (014/FR-023, R8) — was `bg-secondary text-secondary-foreground
        // hover:bg-secondary/80` (solid amber), which made empty-state
        // CTAs visually outrank the actual primary button. Now matches
        // landing's `.btn-secondary` + docs' `.VPButton.alt`: transparent
        // surface with a visible border.
        secondary: 'bg-transparent border border-input/70 hover:bg-muted text-foreground',
        ghost: 'hover:bg-accent hover:text-primary-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        // PR #210 audit item #6: shrunk from size-6 (24px) to size-4 (16px)
        // so inline-icon buttons sit at the same visual weight as the canvas
        // structure-row `.rune-row-expand` (14px). Default svg sizing kept
        // at size-3 (12px) → 2px ring inside the button, matching the chip.
        // Consumers that need a larger button (NamespaceExplorer toolbar,
        // ConditionSection / AnnotationSection reorder/delete) already
        // override with `className="size-5"` or hold size-3.5 glyphs that
        // remain legible inside the new 16px box.
        'icon-xs': "size-4 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-10'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  render,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    render?: React.ReactElement<{ className?: string }>;
  }) {
  const buttonProps = {
    'data-slot': 'button',
    'data-variant': variant,
    'data-size': size,
    className: cn(buttonVariants({ variant, size, className })),
    ...props,
  };

  if (render != null && React.isValidElement(render)) {
    return cloneElementWithMergedClassName(render, buttonProps);
  }

  return <button {...buttonProps} />;
}

export { Button, buttonVariants };
