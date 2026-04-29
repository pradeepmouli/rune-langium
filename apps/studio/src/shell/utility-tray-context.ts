// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { createContext, useContext } from 'react';

export const UtilityTrayContext = createContext<{
  utilitiesCollapsed: boolean;
  setUtilitiesCollapsed(collapsed: boolean): void;
  toggleUtilities(): void;
}>({
  utilitiesCollapsed: false,
  setUtilitiesCollapsed: () => undefined,
  toggleUtilities: () => undefined
});

export function useUtilityTrayControls() {
  return useContext(UtilityTrayContext);
}
