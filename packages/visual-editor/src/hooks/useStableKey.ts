// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Returns a `getKey(item)` accessor that assigns each object a synthetic,
 * stable React key on first sight and remembers it via `WeakMap<object, string>`
 * for the component's lifetime.
 *
 * For editable/reorderable list items with no domain-level id (e.g. Rune DSL
 * conditions, annotation refs, function aliases/operations, synonyms — see
 * their generated types), `name`+index composite keys break on reorder: the
 * index portion shifts, so React treats every row after the moved item as a
 * "new" element and remounts it, silently resetting any per-row local state
 * (an expanded/collapsed disclosure, in-progress edit, etc.).
 *
 * This hook sidesteps that by keying off object *reference identity* instead
 * of array position or content. It relies on Mutative (this repo's domain
 * mutation library) preserving object references for unchanged array
 * elements across a produce() call — reordering swaps positions in the
 * array without touching the element objects themselves, so an item keeps
 * its key across a reorder; only a genuinely edited (and therefore
 * recreated) item gets a fresh one, which is the correct behavior.
 */

import { useRef } from 'react';

let nextId = 0;

export function useStableKey(): (item: object) => string {
  const mapRef = useRef<WeakMap<object, string> | null>(null);
  if (mapRef.current === null) {
    mapRef.current = new WeakMap();
  }
  const map = mapRef.current;

  return (item: object) => {
    let key = map.get(item);
    if (key === undefined) {
      key = `stable-key-${nextId++}`;
      map.set(item, key);
    }
    return key;
  };
}
