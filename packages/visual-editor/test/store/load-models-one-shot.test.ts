// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Regression tests for the ONE-SHOT patch-replay contract in `loadModels`.
 *
 * Contract (load-bearing — do not weaken):
 *   1. After `loadModels` replays pending edits onto a fresh parse, it CLEARS
 *      `pendingEditPatches` to `[]`.
 *   2. Calling `loadModels` AGAIN with the SAME stale parse (that does NOT yet
 *      reflect the edit) must NOT resurrect the edit — the patches were cleared,
 *      so the second load applies the parse verbatim.
 *
 * Why ONE-SHOT is load-bearing (from the inline store comment):
 *   Object-valued edits (cardinality `card`, typeCall) are re-derived by a
 *   reparse with extra AST metadata, so `patchAlreadySatisfied` returns false
 *   for them FOREVER (they never compare byte-equal). If patches were carried
 *   forward they would accumulate and replay stale data indefinitely →
 *   source-document corruption. Clearing them on the first replay window is the
 *   only safe option.
 *
 * These tests specifically use an OBJECT-VALUED edit (cardinality `card`) —
 * the kind that never satisfies — to prove non-accumulation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';

const BASE_SOURCE = `
namespace test.oneshot
version "1.0.0"

type Alpha:
  x string (1..1)
  y string (1..1)
`;

function getAlpha(store: ReturnType<typeof createEditorStore>) {
  return store.getState().nodes.find((n) => n.data.name === 'Alpha')!;
}

function alphaXCard(store: ReturnType<typeof createEditorStore>): unknown {
  const attrs = (getAlpha(store).data as { attributes?: Array<{ name: string; card?: unknown }> }).attributes ?? [];
  return attrs.find((a) => a.name === 'x')?.card;
}

describe('loadModels — one-shot patch clear', () => {
  let store: ReturnType<typeof createEditorStore>;
  let baseModels: unknown;
  let staleModels: unknown;

  beforeEach(async () => {
    store = createEditorStore();
    // Both parses are of the SAME source — stale relative to the cardinality edit.
    baseModels = (await parse(BASE_SOURCE)).value;
    staleModels = (await parse(BASE_SOURCE)).value;
    store.getState().loadModels(baseModels);
  });

  it('clears pendingEditPatches to [] after replaying them on a stale reparse', async () => {
    const alphaId = getAlpha(store).id;

    // Object-valued cardinality edit — `card` is an object ({ $type, inf, sup, unbounded })
    // and patchAlreadySatisfied will return false for it forever (the reparse re-derives it
    // with extra AST metadata so it never compares byte-equal to the patch value).
    store.getState().updateCardinality(alphaId, 'x', '0..1');
    expect(store.getState().pendingEditPatches.length).toBeGreaterThan(0);

    // Stale reparse (source still shows 1..1): patches are replayed, then CLEARED.
    store.getState().loadModels(staleModels);

    // Contract point 1: patches are cleared after replay.
    expect(store.getState().pendingEditPatches).toHaveLength(0);

    // The edit's effect was applied (0..1 cardinality visible in the graph).
    const card = alphaXCard(store) as { inf?: number; sup?: number; unbounded?: boolean } | undefined;
    expect(card?.inf).toBe(0);
  });

  it('does NOT resurrect an object-valued edit on a SECOND stale reparse (non-accumulation)', async () => {
    const alphaId = getAlpha(store).id;

    // Object-valued cardinality edit.
    store.getState().updateCardinality(alphaId, 'x', '0..1');

    // First loadModels: replays + clears.
    store.getState().loadModels(staleModels);
    expect(store.getState().pendingEditPatches).toHaveLength(0);

    // Confirm the edit was applied after the first replay.
    const cardAfterFirstReplay = alphaXCard(store) as { inf?: number } | undefined;
    expect(cardAfterFirstReplay?.inf).toBe(0);

    // Second loadModels with the SAME stale parse. Patches are empty — no replay.
    // The graph should now reflect the raw parse value (1..1 cardinality).
    store.getState().loadModels(staleModels);

    // Contract point 2: the edit is NOT resurrected — the second load shows the parse's value.
    const cardAfterSecondLoad = alphaXCard(store) as { inf?: number } | undefined;
    // The parse encodes 1..1 as `inf:1, sup:1`; after the second load we see the parse value.
    expect(cardAfterSecondLoad?.inf).toBe(1);

    // Patches remain empty (nothing to accumulate).
    expect(store.getState().pendingEditPatches).toHaveLength(0);
  });

  it('parseEpoch is incremented on each loadModels call (both replay and non-replay)', async () => {
    const epochAfterBase = store.getState().parseEpoch; // bumped by beforeEach loadModels

    store.getState().updateCardinality(getAlpha(store).id, 'x', '0..1');

    const epochBeforeFirstReload = store.getState().parseEpoch;
    store.getState().loadModels(staleModels); // replays + clears
    const epochAfterFirstReload = store.getState().parseEpoch;
    expect(epochAfterFirstReload).toBe(epochBeforeFirstReload + 1);

    store.getState().loadModels(staleModels); // no patches — plain load
    const epochAfterSecondReload = store.getState().parseEpoch;
    expect(epochAfterSecondReload).toBe(epochAfterFirstReload + 1);

    // All three epochs are strictly increasing.
    expect(epochAfterBase).toBeLessThan(epochBeforeFirstReload + 1);
    void epochAfterBase; // used above
  });
});
