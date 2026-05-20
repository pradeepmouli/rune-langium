// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Badge — shadcn/ui Badge component with CVA variants.
 *
 * @module
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../utils';

const badgeVariants = cva('inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      default: 'bg-primary text-primary-foreground',
      secondary: 'bg-muted text-muted-foreground border border-border',
      destructive: 'bg-destructive text-destructive-foreground',
      outline: 'text-foreground border border-input',
      success: 'bg-enum-badge text-enum-text',
      warning: 'bg-choice-badge text-choice-text',
      error: 'bg-destructive/10 text-destructive',
      // Kind variants — token-backed so Inspector badges match the Structure
      // View's `.rune-kind-badge--*` chrome (which reads the same vars). Prior
      // hardcoded Tailwind palette utilities (`bg-blue-500/15`, etc.) drifted
      // because the Structure View uses `--color-{kind}-badge` / `--color-
      // {kind}-text` and the Inspector was using palette literals. The four
      // kinds with dedicated badge/text tokens (data/choice/enum/func) consume
      // them directly; the remaining kinds derive from the base kind color
      // using the same `/15` background + `/30` border pattern the Structure
      // View uses (see packages/visual-editor/src/styles.css ~L243–L277).
      data: 'bg-data/15 text-data border border-data/30',
      enum: 'bg-enum/15 text-enum border border-enum/30',
      choice: 'bg-choice/15 text-choice border border-choice/30',
      func: 'bg-func/15 text-func border border-func/30',
      // No dedicated `--color-record` token — Structure View mixes from
      // `--color-data` at the same 15–25% strength. Keep parity here.
      record: 'bg-data/15 text-data border border-data/30',
      // `typeAlias` and `basicType` share the muted-foreground treatment with
      // the Structure View (`.rune-kind-badge--typeAlias, --basicType`).
      typeAlias: 'bg-muted text-muted-foreground border border-border',
      basicType: 'bg-muted text-muted-foreground border border-border',
      // `annotation` mirrors `--color-choice` per the Structure View rule.
      annotation: 'bg-choice/15 text-choice border border-choice/30'
    }
  },
  defaultVariants: {
    variant: 'default'
  }
});

function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
