// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import * as React from 'react';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function cloneElementWithMergedClassName(
  element: React.ReactElement<{ className?: string }>,
  props: Record<string, unknown> & { className?: string }
) {
  return React.cloneElement(element, {
    ...props,
    className: cn(element.props.className, props.className)
  });
}
