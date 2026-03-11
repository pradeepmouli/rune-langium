/**
 * Textarea — shadcn/ui Textarea component.
 *
 * @module
 */

import * as React from 'react';

import { cn } from '../utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-[60px] w-full rounded border border-input bg-transparent px-3 py-2 text-sm text-foreground shadow-xs',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'field-sizing-content',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
