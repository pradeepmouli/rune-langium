// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { cn } from '@rune-langium/design-system/utils';
import type { TypeKind } from '../../types.js';

export interface NodeKindBadgeProps {
  kind: TypeKind;
  className?: string;
}

const COMPACT_KIND_LABELS: Record<TypeKind, string> = {
  data: 'Type',
  choice: 'Choice',
  enum: 'Enum',
  func: 'Function',
  record: 'Record',
  typeAlias: 'Alias',
  basicType: 'Basic',
  annotation: 'Annotation'
};

export function NodeKindBadge({ kind, className }: NodeKindBadgeProps): React.ReactElement {
  return (
    <span className={cn('rune-node-kind-badge', `rune-kind-badge--${kind}`, className)}>
      {COMPACT_KIND_LABELS[kind]}
    </span>
  );
}
