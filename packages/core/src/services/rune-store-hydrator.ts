// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import {
  DefaultHydrator,
  type AstNode,
  type CstNode,
  type DehydrateContext,
  type HydrateContext,
  type Reference,
} from 'langium';

/**
 * Hydrator variant for the Rune store substrate.
 *
 * Differences from DefaultHydrator:
 *  - CST nodes are dropped (stored as `{}`) — the store has no use for parse-tree data.
 *  - References are stored as `{ $refText: string }` only — the editable `Dehydrated<T>` wire format.
 *  - Re-hydration rebuilds a proper `Reference` via `this.linker.buildReference`, passing
 *    `undefined` for the CST node (consistent with the drop above).
 */
export class RuneStoreHydrator extends DefaultHydrator {
  protected override dehydrateCstNode(_node: CstNode, _context: DehydrateContext): Record<string, never> {
    return {};
  }

  protected override dehydrateReference(reference: Reference, _context: DehydrateContext): { $refText: string } {
    return { $refText: reference.$refText };
  }

  protected override hydrateReference(
    reference: { $refText: string },
    node: AstNode,
    name: string,
    _context: HydrateContext,
  ): Reference {
    return this.linker.buildReference(node, name, undefined, reference.$refText);
  }
}
