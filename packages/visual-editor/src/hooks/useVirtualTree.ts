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
const TYPE_ROW_HEIGHT = 28;

export function useVirtualTree(rows: FlatTreeRow[], scrollRef: RefObject<HTMLDivElement | null>) {
  return useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const kind = rows[index]?.kind;
      if (kind === 'namespace') return NAMESPACE_ROW_HEIGHT;
      if (kind === 'segment') return SEGMENT_ROW_HEIGHT;
      return TYPE_ROW_HEIGHT;
    },
    overscan: 10
  });
}
