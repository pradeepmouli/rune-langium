// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/** Build an id→item Map, insertion order preserved. Defaults the key to `item.id`. */
export function indexById<T extends { id: string }>(items: readonly T[]): Map<string, T>;
export function indexById<T>(items: readonly T[], key: (item: T) => string): Map<string, T>;
export function indexById<T>(items: readonly T[], key?: (item: T) => string): Map<string, T> {
  const sel = key ?? ((item: T) => (item as unknown as { id: string }).id);
  return new Map(items.map((item) => [sel(item), item]));
}

/** Derive the value array from an id→item Map (insertion order). */
export function fromIndex<T>(map: ReadonlyMap<string, T>): T[] {
  return [...map.values()];
}
