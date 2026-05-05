// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { createContext, useContext } from 'react';

export type CenterPane = 'graph' | 'source' | 'inspector';

export const CenterPanesContext = createContext<Set<CenterPane>>(
  new Set<CenterPane>(['graph', 'source', 'inspector'])
);

export function useCenterPanes(): Set<CenterPane> {
  return useContext(CenterPanesContext);
}
