// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { createContext, useContext } from 'react';
import { withInstrumentation } from '../services/instrumentation/core.js';

export type CenterPane = 'graph' | 'source' | 'inspector' | 'structure';

export interface CenterPanesContextValue {
  activePanes: Set<CenterPane>;
  toggle: (pane: CenterPane) => void;
}

export const CenterPanesContext = createContext<CenterPanesContextValue>({
  activePanes: new Set<CenterPane>(['graph', 'source', 'inspector']),
  toggle: () => {}
});

export const useCenterPanes = withInstrumentation(
  function useCenterPanes(): CenterPanesContextValue {
    return useContext(CenterPanesContext);
  },
  { op: 'useCenterPanes' }
);
