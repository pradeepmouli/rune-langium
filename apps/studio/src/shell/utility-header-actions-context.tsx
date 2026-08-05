// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/* SPDX-License-Identifier: MIT */
/* Copyright (c) 2026 Pradeep Mouli */

/**
 * Registry that lets utility-tray panels (Problems / Activity / Output)
 * publish their toolbar actions into the dockview group's FIRST row (the
 * tabs-and-actions header) instead of a second row inside the panel body.
 *
 * Why: the tray collapses to tab-row height. Anything rendered inside the
 * panel content (the old PanelHeader action cluster) is clipped when
 * collapsed, leaving no visible open/close, "...", or filter controls.
 * Publishing them here keeps the whole toolbar usable while collapsed.
 *
 * Panels register a ReactNode keyed by their dockview panel id; the
 * DockShell right-header-actions component renders the node belonging to
 * the group's ACTIVE panel (so Problems filters don't show while Output
 * is front). The node closes over the owning panel's state — panels stay
 * mounted when inactive/collapsed, so this is safe.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { withInstrumentation } from '../services/instrumentation/core.js';

interface UtilityHeaderActionsValue {
  actions: ReadonlyMap<string, ReactNode>;
  register: (panelId: string, node: ReactNode) => void;
  unregister: (panelId: string) => void;
}

const NOOP_VALUE: UtilityHeaderActionsValue = {
  actions: new Map(),
  register: () => {},
  unregister: () => {}
};

export const UtilityHeaderActionsContext = createContext<UtilityHeaderActionsValue>(NOOP_VALUE);

export const UtilityHeaderActionsProvider = withInstrumentation(
  function UtilityHeaderActionsProvider({ children }: { children: ReactNode }) {
    const [actions, setActions] = useState<ReadonlyMap<string, ReactNode>>(new Map());
    const register = useCallback((panelId: string, node: ReactNode) => {
      setActions((current) => {
        const next = new Map(current);
        next.set(panelId, node);
        return next;
      });
    }, []);
    const unregister = useCallback((panelId: string) => {
      setActions((current) => {
        if (!current.has(panelId)) return current;
        const next = new Map(current);
        next.delete(panelId);
        return next;
      });
    }, []);
    const value = useMemo(() => ({ actions, register, unregister }), [actions, register, unregister]);
    return <UtilityHeaderActionsContext.Provider value={value}>{children}</UtilityHeaderActionsContext.Provider>;
  },
  { op: 'UtilityHeaderActionsProvider' }
);

/** Publish `node` as the header actions for `panelId` while mounted. */
export const useUtilityHeaderActions = withInstrumentation(
  function useUtilityHeaderActions(panelId: string, node: ReactNode) {
    const { register, unregister } = useContext(UtilityHeaderActionsContext);
    useEffect(() => {
      register(panelId, node);
      return () => unregister(panelId);
    }, [panelId, node, register, unregister]);
  },
  { op: 'useUtilityHeaderActions' }
);
