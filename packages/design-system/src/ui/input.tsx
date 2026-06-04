// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Input — shadcn/ui Input component.
 *
 * Variants:
 * - `default` (original): full-width h-8 field with ring focus, bg-background.
 * - `inline`: compact inspector/row field — bg-card base, 1px primary box-shadow
 *   on focus, bg-background when disabled. Matches the visual contract previously
 *   enforced by the studio panel-level `[data-slot='*-form'] input` overrides.
 *   Size and width are left to the call site via className.
 *
 * @module
 */

import * as React from 'react';

import { cn } from '../utils';

export interface InputProps extends React.ComponentProps<'input'> {
  /**
   * Visual variant.
   * - `'default'`: original full-width h-8 shadcn field.
   * - `'inline'`: compact row/inspector field — bg-card, primary focus ring.
   */
  variant?: 'default' | 'inline';
}

function Input({ className, type, variant = 'default', ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      data-variant={variant !== 'default' ? variant : undefined}
      className={cn(
        // ── default variant ───────────────────────────────────────────────
        variant === 'default' && [
          'h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          'disabled:opacity-50'
        ],
        // ── inline variant — compact inspector/row field ──────────────────
        // Reproduces the panel-level CSS contract:
        //   base:     bg-card, text-foreground, border-border
        //   focus:    border-primary, box-shadow 0 0 0 1px primary
        //   disabled: opacity-0.5, bg-background
        variant === 'inline' && [
          'rounded border border-border bg-card text-foreground',
          'placeholder:text-muted-foreground',
          'outline-none focus:border-primary focus:shadow-[0_0_0_1px_var(--primary)]',
          'disabled:opacity-50 disabled:bg-background',
          'transition-[border-color,box-shadow]'
        ],
        className
      )}
      {...props}
    />
  );
}

export { Input };
