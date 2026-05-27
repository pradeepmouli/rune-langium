// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * IconButtonGroup — pill-shaped container for a horizontally-clustered set of
 * icon-only buttons. Promoted to a design-system primitive from the canonical
 * usage in `NamespaceExplorerPanel` (Studio audit punch-list item #10) so the
 * pattern can be reused across the studio (FormPreview Copy/Reset, future
 * topbar control groups, etc.) without duplicating ~30 lines of pill chrome.
 *
 * Thin wrapper intentionally — the caller writes their own `<Tooltip>` and
 * `<Button>` for each item, so escape hatches (a button that opens a Popover,
 * a button with custom hover treatment) stay trivial. If a more opinionated
 * compound API ever lands, it'd live alongside this as `<IconButtonGroup.Item>`,
 * not replace it.
 *
 * Recommended children:
 *   <IconButtonGroup>
 *     <Tooltip>
 *       <TooltipTrigger render={<Button variant="ghost" size="icon-xs" className="rounded-full" … />}>
 *           <SomeIcon className="size-3.5" />
 *           <span className="sr-only">Label</span>
 *       </TooltipTrigger>
 *       <TooltipContent>Tooltip text</TooltipContent>
 *     </Tooltip>
 *     …more items…
 *   </IconButtonGroup>
 *
 * The `role="toolbar"` is applied automatically; callers can override with the
 * native `role` prop when the semantic differs (e.g., `role="radiogroup"` for
 * a mutually-exclusive selector).
 */

import * as React from 'react';
import { cn } from '../utils.js';

export interface IconButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const IconButtonGroup = React.forwardRef<HTMLDivElement, IconButtonGroupProps>(function IconButtonGroup(
  { className, children, role = 'toolbar', ...props },
  ref
) {
  return (
    <div
      ref={ref}
      role={role}
      className={cn('inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/35 p-0.5', className)}
      {...props}
    >
      {children}
    </div>
  );
});

IconButtonGroup.displayName = 'IconButtonGroup';
