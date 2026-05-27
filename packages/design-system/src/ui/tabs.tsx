// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tabs — shadcn/ui Tabs wrapping @base-ui-components/react Tabs.
 *
 * @module
 */

import { Tabs as TabsPrimitive } from '@base-ui-components/react';

import { cn } from '../utils';

function Tabs({ ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" {...props} />;
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn('flex items-center gap-1 rounded-lg bg-muted p-1', className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Tab>) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        'rounded-md px-3 py-1.5 text-sm',
        'data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm',
        className
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Panel>) {
  return (
    <TabsPrimitive.Panel data-slot="tabs-content" className={cn('mt-2', className)} {...props} />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
