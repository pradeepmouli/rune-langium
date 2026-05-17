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
 *
 * Hydration semantics: while `loadStructureViewState(id)` is in flight, user
 * actions are still applied to the in-memory map for UI responsiveness AND
 * recorded as deferred ops. On hydration completion, ops are replayed onto
 * the loaded map so a fast click during the gap doesn't get clobbered by
 * the load, and a previously-saved expansion the user *didn't* touch isn't
 * dropped. Ops use absolute set/delete semantics so toggleExpansion captures
 * the user's visible intent ("the row I saw was collapsed, expand it"), not
 * a flip relative to the loaded value.
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

/** Deferred user action recorded during hydration; replayed onto the loaded map. */
type DeferredOp = (map: Map<string, boolean>) => void;

export const useStructureViewStore = create<StructureViewState>((set, get) => {
  // Serialize persistence writes. `saveStructureViewState` does an IDB
  // read-modify-write under the hood, so concurrent fire-and-forget calls
  // can interleave and persist an older snapshot last — visibly: toggling
  // a row off then on rapidly can save `{key: true}` *after* the off
  // toggle's `{}`, so on next load the row reappears expanded. Chaining
  // writes guarantees they apply in the order toggles fired; each call
  // captures its own map snapshot at enqueue time.
  let writeChain: Promise<void> = Promise.resolve();

  // When non-undefined, a `setWorkspaceId(id)` hydration is pending. User
  // actions during this window apply immediately to the in-memory map for
  // UI responsiveness and are recorded as ops to replay onto the loaded
  // map. `persist` is gated to avoid writing the partial map back over the
  // soon-to-be-loaded saved state.
  //
  // `gen` is a per-request token, bumped on every setWorkspaceId call. A
  // late-arriving completion only consumes `hydration.ops` if its captured
  // gen matches — without this, an A→B→A rapid switch would let the
  // first A's late load grab the third A's ops queue, leaving the third
  // A's completion to overwrite the user's clicks with stale saved data.
  let hydrationGen = 0;
  let hydration: { id: string; gen: number; ops: DeferredOp[] } | undefined;

  const persist = (map: Map<string, boolean>): void => {
    const id = get().workspaceId;
    if (!id) return;
    // Defer: the hydration completion path will persist the merged state.
    if (hydration && hydration.id === id) return;
    const obj: Record<string, boolean> = {};
    for (const [k, v] of map) obj[k] = v;
    writeChain = writeChain.then(() =>
      saveStructureViewState(id, obj).catch(() => {
        // IDB unavailable (private mode, tests with no fake-indexeddb,
        // or workspace race-deleted) — silently skip; next toggle retries.
      })
    );
  };

  /** Apply an op to the in-memory map, queue for replay if hydrating, persist otherwise. */
  const applyOp = (op: DeferredOp): void => {
    const map = new Map(get().expansionMap);
    op(map);
    set({ expansionMap: map });
    if (hydration) {
      hydration.ops.push(op);
      return;
    }
    persist(map);
  };

  return {
    workspaceId: undefined,
    expansionMap: new Map(),
    dragSource: undefined,

    async setWorkspaceId(id) {
      const gen = ++hydrationGen;
      set({ workspaceId: id, expansionMap: new Map() });
      hydration = id ? { id, gen, ops: [] } : undefined;
      if (!id) return;
      try {
        const persisted = await loadStructureViewState(id);
        // Only the completion holding the current generation token may
        // consume the hydration queue. Late-arriving loads from earlier
        // setWorkspaceId calls (including ones for the *same* id, e.g.,
        // an A→B→A switch sequence) are dropped here, leaving the
        // newest call's queue intact for its own completion to handle.
        if (hydration?.gen !== gen) return;
        const local = hydration;
        hydration = undefined;
        // Merge: start with loaded state, then replay any user actions
        // that happened during the gap. Ops carry absolute set/delete
        // semantics so the user's visible intent wins for keys they
        // touched while loaded values fill in everything else.
        const merged = new Map<string, boolean>(Object.entries(persisted));
        for (const op of local.ops) op(merged);
        set({ expansionMap: merged });
        // If the user touched anything during the gap, the loaded state is
        // no longer canonical — persist the merged state so it survives.
        if (local.ops.length > 0) persist(merged);
      } catch {
        // Persistence unavailable; keep whatever in-memory state we have.
        if (hydration?.gen === gen) hydration = undefined;
      }
    },

    isExpanded(key) {
      return get().expansionMap.get(expansionKey(key)) === true;
    },

    toggleExpansion(key) {
      const k = expansionKey(key);
      // Capture the absolute target value from what the user SEES right
      // now (the in-memory map). On replay against a loaded map this
      // preserves "the user clicked while seeing collapsed" intent
      // regardless of what the saved value turns out to be.
      const targetExpanded = get().expansionMap.get(k) !== true;
      const op: DeferredOp = (map) => {
        if (targetExpanded) {
          map.set(k, true);
        } else {
          map.delete(k);
        }
      };
      applyOp(op);
    },

    collapseAll(namespaceUri) {
      const prefix = `${namespaceUri}::`;
      // Short-circuit only when NOT hydrating — during hydration we must
      // still record the op so it can erase any loaded keys in this
      // namespace when the merge runs.
      if (!hydration) {
        const map = get().expansionMap;
        let hasMatch = false;
        for (const k of map.keys()) {
          if (k.startsWith(prefix)) {
            hasMatch = true;
            break;
          }
        }
        if (!hasMatch) return;
      }
      const op: DeferredOp = (map) => {
        for (const k of Array.from(map.keys())) {
          if (k.startsWith(prefix)) map.delete(k);
        }
      };
      applyOp(op);
    },

    resetExpansion() {
      const op: DeferredOp = (map) => map.clear();
      applyOp(op);
    },

    setDragSource(payload) {
      set({ dragSource: payload });
    },

    clearDragSource() {
      set({ dragSource: undefined });
    }
  };
});
