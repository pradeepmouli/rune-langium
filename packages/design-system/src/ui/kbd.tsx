// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import * as React from 'react';
import { cn } from '../utils';

function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex h-5 items-center rounded-md border border-border bg-muted px-1.5 font-mono text-[10.5px] font-medium text-muted-foreground',
        className
      )}
      {...props}
    />
  );
}

export { Kbd };
