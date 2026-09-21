// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { create } from 'zustand';
import type { InstanceSeed } from '../components/InstanceCreateDialog.js';
import { usePerspectiveStore } from '../store/perspective-store.js';
import { withInstrumentation } from './instrumentation/core.js';

export type PrototypeIntent = { kind: 'create'; seed: InstanceSeed } | { kind: 'open'; instanceId: string };
interface StoredIntent {
  workspaceId: string | null;
  intent: PrototypeIntent;
}
interface PrototypeNavigationState {
  pending: StoredIntent | null;
  request(workspaceId: string, intent: PrototypeIntent): void;
  consume(workspaceId: string): PrototypeIntent | null;
}

export const usePrototypeNavigationStore = create<PrototypeNavigationState>((set, get) => ({
  pending: null,
  request(workspaceId, intent) {
    set({ pending: { workspaceId, intent: structuredClone(intent) } });
    usePerspectiveStore.getState().setActivePerspective('prototype');
  },
  consume(workspaceId) {
    const pending = get().pending;
    if (!pending || pending.workspaceId !== workspaceId) return null;
    set({ pending: null });
    return pending.intent;
  }
}));

export const requestPrototype = withInstrumentation(
  function requestPrototype(workspaceId: string, intent: PrototypeIntent): void {
    usePrototypeNavigationStore.getState().request(workspaceId, intent);
  },
  { op: 'requestPrototype' }
);
