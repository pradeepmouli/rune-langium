/**
 * Input — shadcn/ui Input component.
 *
 * @module
 */

import * as React from 'react';

import { cn } from '../utils.js';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-8 w-full rounded-md border border-border-emphasis bg-surface-sunken px-3 py-1 text-sm text-text-primary',
        'placeholder:text-text-muted',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1',
        'disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}

export { Input };
