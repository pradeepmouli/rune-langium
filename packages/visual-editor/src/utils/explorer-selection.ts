// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { TypeGraphNode } from '../types.js';

/** Describes a whole-namespace selection operation for consumers that persist roots. */
export interface ExplorerSelectionAction {
  kind: 'namespace';
  namespaces: readonly string[];
  checked: boolean;
}

/** Controlled selection state for a namespace explorer. */
export interface ExplorerSelection {
  /** Entries the caller selected directly. */
  explicit: ReadonlySet<string>;
  /** Entries included because each listed root requires them. */
  requiredBy: ReadonlyMap<string, readonly string[]>;
  /** Receives the next explicit selection. */
  onChange(next: Set<string>, action?: ExplorerSelectionAction): void;
  /** Converts an explorer node to the caller's canonical selection key. */
  getSelectionId?(node: TypeGraphNode): string;
}

/** Returns the checkbox state for a collection of selection IDs. */
export function selectionState(ids: readonly string[], selected: ReadonlySet<string>): boolean | 'indeterminate' {
  const count = ids.filter((id) => selected.has(id)).length;
  return count === 0 ? false : count === ids.length ? true : 'indeterminate';
}

/** Adds or removes only the supplied IDs, preserving every other selection. */
export function toggleVisible(ids: readonly string[], selected: ReadonlySet<string>, checked: boolean): Set<string> {
  const next = new Set(selected);
  for (const id of ids) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return next;
}
