// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import * as React from 'react';
import { Separator as SeparatorPrimitive } from '@base-ui/react/separator';

import { cn } from '../utils';

function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive> & { decorative?: boolean }) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      // When decorative, override the default role="separator" to hide from a11y tree.
      // aria-orientation must be suppressed too, not just role — role="none" doesn't
      // permit aria-orientation (axe aria-allowed-attr) — but @base-ui/react's own
      // Separator.js always sets 'aria-orientation': orientation as a props-merge
      // default regardless of role, so it has to be explicitly overridden here rather
      // than merely omitted (mergeProps' rightmost-object-wins semantics only drop the
      // primitive's default when this component's own props object defines the same
      // key, even as undefined — confirmed against the installed
      // @base-ui/react/merge-props/mergeProps.js).
      role={decorative ? 'none' : undefined}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        'bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px',
        className
      )}
      {...props}
    />
  );
}

export { Separator };
