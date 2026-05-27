// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * RadioGroup — shadcn/ui RadioGroup wrapping @base-ui-components/react Radio/RadioGroup.
 *
 * @module
 */

import * as React from 'react';
import { RadioGroup as RadioGroupPrimitive, Radio } from '@base-ui-components/react';
import { Circle } from 'lucide-react';

import { cn } from '../utils';

function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive>) {
  return (
    <RadioGroupPrimitive data-slot="radio-group" className={cn('grid gap-2', className)} {...props} />
  );
}

function RadioGroupItem({ className, ...props }: React.ComponentProps<typeof Radio.Root>) {
  return (
    <Radio.Root
      data-slot="radio-group-item"
      render={<button />}
      className={cn(
        'aspect-square size-4 shrink-0 rounded-full border border-input text-primary shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      <Radio.Indicator
        data-slot="radio-group-indicator"
        className="flex items-center justify-center"
      >
        <Circle className="size-2 fill-primary text-primary" />
      </Radio.Indicator>
    </Radio.Root>
  );
}

export { RadioGroup, RadioGroupItem };
