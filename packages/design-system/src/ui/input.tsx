/**
 * Input — shadcn/ui Input component.
 *
 * @module
 */

import * as React from 'react';

import { cn } from '../utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        'disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}

export { Input };
