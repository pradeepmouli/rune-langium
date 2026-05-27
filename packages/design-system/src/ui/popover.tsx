// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Popover — shadcn/ui Popover wrapping @base-ui-components/react Popover.
 *
 * @module
 */

import { Popover as PopoverPrimitive } from '@base-ui-components/react';

import { cn } from '../utils';

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

// Base UI Popover has no Anchor concept — render a plain div passthrough.
// No consumers currently use this export.
function PopoverAnchor({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="popover-anchor" className={className} {...props} />;
}

function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Popup> &
  Pick<React.ComponentProps<typeof PopoverPrimitive.Positioner>, 'sideOffset' | 'align'>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner sideOffset={sideOffset} align={align}>
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            'z-50 w-72 rounded border border-border bg-popover p-4 text-popover-foreground shadow-md outline-none',
            'data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
