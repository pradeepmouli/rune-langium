// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import * as React from 'react';
import { KindBadge } from '../KindBadge.js';
import type { TypeKind } from '../../types.js';

export interface NodeKindBadgeProps {
  kind: TypeKind;
  className?: string;
}

/** @deprecated Use <KindBadge>. Retained as a thin alias for existing node components. */
export function NodeKindBadge({ kind, className }: NodeKindBadgeProps): React.ReactElement {
  return <KindBadge kind={kind} shape="label" className={className} />;
}
