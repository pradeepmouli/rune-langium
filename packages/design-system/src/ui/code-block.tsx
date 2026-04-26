// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type React from 'react';
import { cn } from '../utils.js';

export interface CodeBlockProps extends React.HTMLAttributes<HTMLPreElement> {
  language?: string;
}

export function CodeBlock({
  language,
  className,
  children,
  ...rest
}: CodeBlockProps): React.ReactElement {
  return (
    <pre
      className={cn('overflow-x-auto rounded-md border bg-muted p-3 font-mono text-sm', className)}
      data-language={language}
      {...rest}
    >
      <code>{children}</code>
    </pre>
  );
}
