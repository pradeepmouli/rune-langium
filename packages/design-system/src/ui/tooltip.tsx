// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tooltip — shadcn/ui Tooltip wrapping @base-ui-components/react Tooltip.
 *
 * @module
 */

import { Tooltip as TooltipPrimitive } from '@base-ui-components/react';

import { cn } from '../utils';

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider> & { delayDuration?: number }) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delayDuration} {...props} />;
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 4,
  side,
  align,
  alignOffset,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Popup> &
  Pick<React.ComponentProps<typeof TooltipPrimitive.Positioner>, 'sideOffset' | 'side' | 'align' | 'alignOffset'>) {
  return (
    <TooltipPrimitive.Positioner sideOffset={sideOffset} side={side} align={align} alignOffset={alignOffset}>
      <TooltipPrimitive.Popup
        data-slot="tooltip-content"
        className={cn(
          'bg-popover text-popover-foreground text-xs px-3 py-1.5 rounded-md shadow-md border border-border',
          'z-50',
          'animate-in fade-in-0 zoom-in-95',
          'data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95',
          'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Positioner>
  );
}

export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent };
