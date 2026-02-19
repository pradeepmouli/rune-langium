/**
 * Badge — shadcn/ui Badge component with CVA variants.
 *
 * @module
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../utils.js';

const badgeVariants = cva('inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      default: 'bg-accent text-white',
      secondary: 'bg-surface-overlay text-text-secondary border border-border-default',
      destructive: 'bg-error text-white',
      outline: 'text-text-primary border border-border-emphasis',
      success: 'bg-enum-badge text-enum-text',
      warning: 'bg-choice-badge text-choice-text',
      error: 'bg-error-bg text-error-text',
      data: 'bg-blue-500/15 text-blue-300 border border-blue-500/25',
      enum: 'bg-green-500/15 text-green-300 border border-green-500/25',
      choice: 'bg-amber-500/15 text-amber-300 border border-amber-500/25',
      func: 'bg-purple-500/15 text-purple-300 border border-purple-500/25'
    }
  },
  defaultVariants: {
    variant: 'default'
  }
});

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
