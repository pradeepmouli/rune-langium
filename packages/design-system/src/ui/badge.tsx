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
      data: 'bg-blue-500/15 text-blue-300 border border-blue-500/25',
      enum: 'bg-green-500/15 text-green-300 border border-green-500/25',
      choice: 'bg-amber-500/15 text-amber-300 border border-amber-500/25',
      func: 'bg-purple-500/15 text-purple-300 border border-purple-500/25',
      record: 'bg-teal-500/15 text-teal-300 border border-teal-500/25',
      typeAlias: 'bg-slate-500/15 text-slate-300 border border-slate-500/25',
      basicType: 'bg-gray-500/15 text-gray-300 border border-gray-500/25',
      annotation: 'bg-rose-500/15 text-rose-300 border border-rose-500/25'
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
