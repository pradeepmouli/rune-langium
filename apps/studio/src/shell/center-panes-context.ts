// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { createContext, useContext } from 'react';

export type CenterPane = 'graph' | 'source' | 'inspector' | 'structure';

export interface CenterPanesContextValue {
  activePanes: Set<CenterPane>;
  toggle: (pane: CenterPane) => void;
}

export const CenterPanesContext = createContext<CenterPanesContextValue>({
  activePanes: new Set<CenterPane>(['graph', 'source', 'inspector']),
  toggle: () => {}
});

export function useCenterPanes(): CenterPanesContextValue {
  return useContext(CenterPanesContext);
}
