// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Virtual tree hook — wraps @tanstack/react-virtual for namespace explorer tree.
 */

import { useVirtualizer } from '@tanstack/react-virtual';
import type { RefObject } from 'react';
import type { FlatTreeRow } from '../utils/namespace-tree.js';

const NAMESPACE_ROW_HEIGHT = 36;
const SEGMENT_ROW_HEIGHT = 32;
// Extra height a segment header reserves for the per-kind breakdown chip row.
// Only segments with direct types (non-empty kindCounts) render the chips.
const SEGMENT_KINDS_ROW_HEIGHT = 18;
const TYPE_ROW_HEIGHT = 28;

export function useVirtualTree(rows: FlatTreeRow[], scrollRef: RefObject<HTMLDivElement | null>) {
  return useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      if (row?.kind === 'namespace') return NAMESPACE_ROW_HEIGHT;
      if (row?.kind === 'segment') {
        const hasKindChips = Object.keys(row.kindCounts ?? {}).length > 0;
        return SEGMENT_ROW_HEIGHT + (hasKindChips ? SEGMENT_KINDS_ROW_HEIGHT : 0);
      }
      return TYPE_ROW_HEIGHT;
    },
    overscan: 10
  });
}
