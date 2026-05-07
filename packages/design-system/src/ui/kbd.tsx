// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Kbd — keyboard shortcut chip.
 *
 * Tiny styled `<kbd>` for inline shortcut hints. Uses the mono font and
 * the muted-on-card token combo so it sits naturally inside inputs,
 * tooltips, and command-palette triggers.
 */

import * as React from 'react';

import { cn } from '../utils';

function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex items-center justify-center rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground',
        className
      )}
      {...props}
    />
  );
}

export { Kbd };
