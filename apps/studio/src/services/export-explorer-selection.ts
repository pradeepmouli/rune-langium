// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { declarationKey } from '@rune-langium/codegen/export';
import type { ExportDeclarationSelection, ExportSelection } from '@rune-langium/codegen/export';
import type { ExplorerSelectionAction, NodeRepository, TypeGraphNode } from '@rune-langium/visual-editor';
import { withInstrumentation } from './instrumentation/core.js';

/** Stable identifier shared by the Explorer's controlled selection and codegen roots. */
const exportSelectionId = declarationKey;

/** Converts a graph node into codegen's public declaration-root representation. */
export const exportDeclarationFromNode = withInstrumentation(
  function exportDeclarationFromNode(node: TypeGraphNode): ExportDeclarationSelection | undefined {
    const name = node.data.name;
    if (!node.meta.namespace || typeof name !== 'string' || !name) return undefined;
    return { namespace: node.meta.namespace, name, kind: node.data.$type };
  },
  { op: 'exportDeclarationFromNode' }
);

/** Gives the Explorer a canonical key while retaining a safe identity for incomplete nodes. */
export const exportSelectionIdForNode = withInstrumentation(
  function exportSelectionIdForNode(node: TypeGraphNode): string {
    const declaration = exportDeclarationFromNode(node);
    return declaration ? exportSelectionId(declaration) : node.id;
  },
  { op: 'exportSelectionIdForNode' }
);

/** Expands semantic namespace roots into the Explorer's controlled explicit set. */
export const exportSelectionToExplorerSet = withInstrumentation(
  function exportSelectionToExplorerSet(selection: ExportSelection, repository: NodeRepository): Set<string> {
    const explicit = new Set(selection.declarations.map(exportSelectionId));
    for (const namespace of selection.namespaces) {
      for (const node of repository.byNamespace(namespace)) explicit.add(exportSelectionIdForNode(node));
    }
    return explicit;
  },
  { op: 'exportSelectionToExplorerSet' }
);

/**
 * Applies an Explorer interaction without exposing graph-node IDs to codegen.
 * Namespace actions retain their semantic roots; leaf and bulk actions are
 * normalized to the smallest collection of declaration roots.
 */
export const exportSelectionFromExplorer = withInstrumentation(
  function exportSelectionFromExplorer(
    next: ReadonlySet<string>,
    previous: ExportSelection,
    repository: NodeRepository,
    action?: ExplorerSelectionAction
  ): ExportSelection {
    if (action?.kind === 'namespace') {
      const namespaces = action.checked
        ? [...new Set([...previous.namespaces, ...action.namespaces])]
        : previous.namespaces.filter((namespace) => !action.namespaces.includes(namespace));
      const declarations = action.checked
        ? previous.declarations
        : previous.declarations.filter((declaration) => !action.namespaces.includes(declaration.namespace));
      return { namespaces, declarations };
    }

    const declarations = repository.all().flatMap((node) => {
      const declaration = exportDeclarationFromNode(node);
      return declaration && next.has(exportSelectionId(declaration)) ? [declaration] : [];
    });
    const namespaces = previous.namespaces.filter((namespace) => {
      const declarationsInNamespace = repository.byNamespace(namespace).map(exportSelectionIdForNode);
      return declarationsInNamespace.every((id) => next.has(id));
    });
    const coveredNamespaces = new Set(namespaces);
    const knownDeclarationIds = new Set(repository.all().map(exportSelectionIdForNode));
    const unresolved =
      next.size === 0
        ? []
        : previous.declarations.filter((declaration) => !knownDeclarationIds.has(exportSelectionId(declaration)));
    return {
      namespaces,
      declarations: [
        ...unresolved,
        ...declarations.filter((declaration) => !coveredNamespaces.has(declaration.namespace))
      ]
    };
  },
  { op: 'exportSelectionFromExplorer' }
);
