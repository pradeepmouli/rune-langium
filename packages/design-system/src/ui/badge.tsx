/**
 * Badge — shadcn/ui Badge component with CVA variants.
 *
 * @module
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../utils.js';

const badgeVariants = cva(
  'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-primary/20 text-primary border border-primary/30',
        secondary: 'bg-secondary text-secondary-foreground',
        destructive: 'bg-destructive/20 text-destructive border border-destructive/30',
        outline: 'text-foreground border',
        data: 'bg-blue-500/15 text-blue-300 border border-blue-500/25',
        enum: 'bg-green-500/15 text-green-300 border border-green-500/25',
        choice: 'bg-amber-500/15 text-amber-300 border border-amber-500/25',
        func: 'bg-purple-500/15 text-purple-300 border border-purple-500/25'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
);

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
