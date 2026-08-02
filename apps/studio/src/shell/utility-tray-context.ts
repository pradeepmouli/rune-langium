// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { createContext, useContext } from 'react';
import { withInstrumentation } from '../services/instrumentation/core.js';

export const UtilityTrayContext = createContext<{
  utilitiesCollapsed: boolean;
  setUtilitiesCollapsed(collapsed: boolean): void;
  toggleUtilities(): void;
}>({
  utilitiesCollapsed: false,
  setUtilitiesCollapsed: () => undefined,
  toggleUtilities: () => undefined
});

export const useUtilityTrayControls = withInstrumentation(
  function useUtilityTrayControls() {
    return useContext(UtilityTrayContext);
  },
  { op: 'useUtilityTrayControls' }
);
