// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Structure View local state: per-attribute expansion + active drag source.
 *
 * Expansion state persists to IndexedDB via the existing workspace-persistence
 * layer (per-workspace `structureView` slot on `WorkspaceRecord`). Drag-source
 * state is purely in-memory (cleared on session end).
 *
 * The active workspace id is supplied externally via `setWorkspaceId(id)`;
 * callers should invoke that whenever the workspace switches so persistence
 * is keyed correctly. Until a workspace id is set, persistence writes are
 * dropped silently — the in-memory map still updates so the UI stays
 * responsive during the brief window before workspace hydration completes.
 */

import { create } from 'zustand';
import { loadStructureViewState, saveStructureViewState } from '../workspace/persistence.js';
import { type StructureExpansionKey, type TypeRefPayload, expansionKey } from '@rune-langium/visual-editor';

interface StructureViewState {
  workspaceId: string | undefined;
  expansionMap: Map<string, boolean>;
  dragSource: TypeRefPayload | undefined;
  setWorkspaceId: (id: string | undefined) => Promise<void>;
  isExpanded: (key: StructureExpansionKey) => boolean;
  toggleExpansion: (key: StructureExpansionKey) => void;
  collapseAll: (namespaceUri: string) => void;
  resetExpansion: () => void;
  setDragSource: (payload: TypeRefPayload) => void;
  clearDragSource: () => void;
}

export const useStructureViewStore = create<StructureViewState>((set, get) => {
  // Serialize persistence writes. `saveStructureViewState` does an IDB
  // read-modify-write under the hood, so concurrent fire-and-forget calls
  // can interleave and persist an older snapshot last — visibly: toggling
  // a row off then on rapidly can save `{key: true}` *after* the off
  // toggle's `{}`, so on next load the row reappears expanded. Chaining
  // writes guarantees they apply in the order toggles fired; each call
  // captures its own map snapshot at enqueue time.
  let writeChain: Promise<void> = Promise.resolve();

  const persist = (map: Map<string, boolean>): void => {
    const id = get().workspaceId;
    if (!id) return;
    const obj: Record<string, boolean> = {};
    for (const [k, v] of map) obj[k] = v;
    writeChain = writeChain.then(() =>
      saveStructureViewState(id, obj).catch(() => {
        // IDB unavailable (private mode, tests with no fake-indexeddb,
        // or workspace race-deleted) — silently skip; next toggle retries.
      })
    );
  };

  return {
    workspaceId: undefined,
    expansionMap: new Map(),
    dragSource: undefined,

    async setWorkspaceId(id) {
      set({ workspaceId: id, expansionMap: new Map() });
      if (!id) return;
      try {
        const persisted = await loadStructureViewState(id);
        // Guard against stale hydration: if the active workspace changed
        // while loadStructureViewState was in flight (e.g., user switched
        // workspaces twice quickly), drop this result so we don't overwrite
        // the newer workspace's empty map with the older workspace's data.
        if (get().workspaceId !== id) return;
        set({ expansionMap: new Map(Object.entries(persisted)) });
      } catch {
        // Persistence unavailable; keep the empty map we just set.
      }
    },

    isExpanded(key) {
      return get().expansionMap.get(expansionKey(key)) === true;
    },

    toggleExpansion(key) {
      const map = new Map(get().expansionMap);
      const k = expansionKey(key);
      // Delete on collapse so the persisted map doesn't accumulate dead
      // `false` entries over a session — isExpanded treats absence as
      // collapsed, so the two states are equivalent.
      if (map.get(k) === true) {
        map.delete(k);
      } else {
        map.set(k, true);
      }
      set({ expansionMap: map });
      persist(map);
    },

    collapseAll(namespaceUri) {
      const prefix = `${namespaceUri}::`;
      const map = new Map(get().expansionMap);
      let changed = false;
      for (const k of Array.from(map.keys())) {
        if (k.startsWith(prefix)) {
          map.delete(k);
          changed = true;
        }
      }
      if (!changed) return;
      set({ expansionMap: map });
      persist(map);
    },

    resetExpansion() {
      set({ expansionMap: new Map() });
      persist(new Map());
    },

    setDragSource(payload) {
      set({ dragSource: payload });
    },

    clearDragSource() {
      set({ dragSource: undefined });
    }
  };
});
