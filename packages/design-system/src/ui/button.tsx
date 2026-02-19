/**
 * Button — shadcn/ui Button with CVA variants and Slot support.
 *
 * @module
 */

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../utils.js';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded text-sm font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface-base',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0'
  ],
  {
    variants: {
      variant: {
        default:
          'bg-accent border border-accent text-white hover:bg-accent-hover hover:border-accent-hover',
        secondary:
          'bg-surface-overlay text-text-primary border border-border-emphasis hover:bg-border-emphasis hover:text-text-heading',
        ghost: 'hover:bg-surface-overlay text-text-secondary',
        destructive: 'bg-error text-white',
        outline: 'border border-border-emphasis text-text-primary hover:bg-surface-overlay',
        link: 'text-accent-text underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-auto px-2.5 py-1 text-sm',
        lg: 'h-auto rounded-lg px-6 py-2.5 text-md',
        icon: 'h-8 w-8'
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
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
