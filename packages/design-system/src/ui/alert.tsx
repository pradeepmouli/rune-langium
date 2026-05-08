// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils';

const alertVariants = cva('relative w-full rounded-lg border px-4 py-3 text-sm [&>svg~*]:pl-7', {
  variants: {
    variant: {
      default: 'bg-background text-foreground border-border',
      destructive: 'border-destructive/40 bg-destructive/8 text-destructive dark:border-destructive/30'
    }
  },
  defaultVariants: {
    variant: 'default'
  }
});

function Alert({ className, variant, ...props }: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div role="alert" data-slot="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-description" className={cn('text-sm', className)} {...props} />;
}

export { Alert, AlertDescription };
