// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import {
  AstUtils,
  DefaultHydrator,
  type AstNode,
  type CstNode,
  type DehydrateContext,
  type HydrateContext,
  type Reference,
} from 'langium';
import { isRosettaModel } from '../generated/ast.js';
import type { Dehydrated } from '../serializer/dehydrated.js';

/**
 * Hydrator variant for the Rune store substrate.
 *
 * Differences from DefaultHydrator:
 *  - CST nodes are dropped entirely — the store has no use for parse-tree data.
 *    (`$cstNode`, `$containerIndex`, and `$containerProperty` are deleted from
 *    the output so the runtime object matches the `Dehydrated<T>` type, which
 *    excludes all Langium runtime fields.)
 *  - `$cstText` (a custom field stamped by `preserveCstText` BEFORE dehydration)
 *    is preserved — the visual editor's expression cells read it after the
 *    round-trip, and DefaultHydrator would otherwise drop it as a `$`-field.
 *  - References are stored as `{ $refText: string }` only — the editable `Dehydrated<T>` wire format.
 *  - Re-hydration rebuilds a proper `Reference` via `this.linker.buildReference`, passing
 *    `undefined` for the CST node (consistent with the drop above).
 *  - $namespace is stamped from the enclosing RosettaModel before $container is stripped.
 */
export class RuneStoreHydrator extends DefaultHydrator {
  /** Dehydrate a single AST node to its Dehydrated<T> wire form. */
  dehydrateNode<T extends AstNode>(node: T): Dehydrated<T> {
    const context = this.createDehyrationContext(node);
    return this.dehydrateAstNode(node, context) as Dehydrated<T>;
  }

  /**
   * CST nodes never survive dehydration here (see class doc), so skip the
   * base class's full CST-tree walk when building the context — on large
   * corpora that walk dominates dehydration cost for zero benefit.
   */
  protected override createDehyrationContext(node: AstNode): DehydrateContext {
    const astNodes = new Map<AstNode, unknown>();
    for (const astNode of AstUtils.streamAst(node)) {
      astNodes.set(astNode, {});
    }
    return { astNodes, cstNodes: new Map() } as DehydrateContext;
  }

  protected override dehydrateAstNode(node: AstNode, context: DehydrateContext): object {
    const result = super.dehydrateAstNode(node, context) as Record<string, unknown>;
    // Runtime-only linkage fields — excluded from Dehydrated<T>.
    delete result.$containerIndex;
    delete result.$containerProperty;
    delete result.$cstNode;
    // Preserve the preserveCstText stamp (custom field, skipped by the base
    // class's `$`-prefix filter).
    const cstText = (node as AstNode & { $cstText?: unknown }).$cstText;
    if (typeof cstText === 'string') {
      result.$cstText = cstText;
    }
    const model = AstUtils.getContainerOfType(node, isRosettaModel);
    if (model) {
      result.$namespace = model.name;
    }
    return result;
  }

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
