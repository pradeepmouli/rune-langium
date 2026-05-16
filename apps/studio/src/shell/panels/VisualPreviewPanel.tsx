// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * VisualPreviewPanel — wraps the graph view and (Phase 7+) the Structure View
 * in a Radix Tabs shell, so users can switch between the two without
 * unmounting either subtree.
 *
 * Tab "graph"     — hosts whatever `children` the parent passes in (typically
 *                   the RuneTypeGraph via the dockview panel factory).
 * Tab "structure" — renders `<StructureView>` for the currently-selected node,
 *                   composing the Phase 2 adapter + Phase 3 layout.
 *
 * **`asAdapterDocument` derivation** — the editor store's `nodes` array holds
 * `TypeGraphNode` (= React Flow `Node<AnyGraphNode>`). We project them into the
 * `AdapterDocument` shape required by `buildStructureGraph`. Only `Data`,
 * `Choice`, and `Enum` nodes are included; unknown kinds are dropped silently.
 * This helper is intentionally local to this file; it should NOT be added to
 * the editor-store because it encodes a display-specific projection that is
 * only needed by the Structure View. If a future use case (e.g., LSP hover)
 * needs the same projection, extract it to a shared `adapter-document.ts` then.
 *
 * **`useStructureViewStore` wiring** — `expansionMap` and `dragSource` are
 * consumed here. `setWorkspaceId` is wired in the workspace-init path
 * (EditorPage/DockShell); it is NOT called here to avoid a second mount-time
 * side-effect. If that path doesn't cover VisualPreviewPanel's lifecycle,
 * that's a Phase 8 concern (TODO: verify setWorkspaceId is called before
 * StructureView mounts in production; add a guard if not).
 */

import type React from 'react';
import { useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@rune-langium/design-system/ui/tabs';
import { StructureView, useEditorStore } from '@rune-langium/visual-editor';
import type { AdapterDocument, AdapterNode } from '@rune-langium/visual-editor';
import type { AnyGraphNode } from '@rune-langium/visual-editor';
import { useStructureViewStore } from '../../store/structure-view-store.js';

// ---------------------------------------------------------------------------
// Adapter: TypeGraphNode[] → AdapterDocument
// ---------------------------------------------------------------------------

/**
 * Project the editor store's node array into the AdapterDocument shape.
 *
 * Only `Data`, `Choice`, and `Enum` nodes are included. `superType.$refText`
 * maps to `extends`; `attributes` and `options` carry through directly since
 * their fields (`name`, `typeCall`, `card`) are structurally identical to
 * `AdapterAttribute`.
 *
 * This is a **pure projection** — no side-effects, safe to call inside useMemo.
 */
function graphNodesToAdapterDocument(nodes: readonly { id: string; data: AnyGraphNode }[]): AdapterDocument {
  const adapterNodes: AdapterNode[] = [];
  const namespacesSet = new Set<string>();

  for (const rfNode of nodes) {
    const d = rfNode.data;
    if (!d || typeof d.namespace !== 'string') continue;
    namespacesSet.add(d.namespace);

    if (d.$type === 'Data') {
      adapterNodes.push({
        id: rfNode.id,
        $type: 'Data',
        name: d.name,
        namespace: d.namespace,
        extends: d.superType?.$refText,
        // `attributes` on AstNodeModel<Data> has the same structural shape as
        // AdapterAttribute: { name, typeCall: { type?: { $refText? } }, card: { inf, sup?, unbounded } }
        attributes: (d.attributes ?? []) as AdapterNode['attributes']
      });
    } else if (d.$type === 'Choice') {
      // Choice nodes use `options` in the AST, but AdapterNode.attributes maps
      // to whichever sub-array holds the selectable arms. For the structure-view
      // adapter a Choice's `options` acts like attributes (each option is a row).
      adapterNodes.push({
        id: rfNode.id,
        $type: 'Choice',
        name: d.name,
        namespace: d.namespace,
        attributes: (d.options ?? []) as AdapterNode['attributes']
      });
    } else if (d.$type === 'RosettaEnumeration') {
      adapterNodes.push({
        id: rfNode.id,
        $type: 'Enum',
        name: d.name,
        namespace: d.namespace,
        values: (d.enumValues ?? []) as Array<{ name: string }>
      });
    }
    // Other kinds (Function, RecordType, TypeAlias, etc.) are not relevant to Structure View
  }

  const namespaces = Array.from(namespacesSet).map((uri) => ({ uri }));
  return { namespaces, nodes: adapterNodes };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface VisualPreviewPanelProps {
  children?: React.ReactNode;
}

export function VisualPreviewPanel({ children }: VisualPreviewPanelProps): React.ReactElement {
  // Editor store selectors — reactive, stable references from zustand
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const storeNodes = useEditorStore((s) => s.nodes);

  // Structure view store — expansion state + drag source (drag-source reserved for Phase 8)
  const expansionMap = useStructureViewStore((s) => s.expansionMap);
  // dragSource imported for Phase 8 readiness — not yet used in this panel
  // const dragSource = useStructureViewStore((s) => s.dragSource);

  // Derive AdapterDocument from the editor store nodes (pure projection)
  const adapterDocument = useMemo(
    () => (storeNodes.length > 0 ? graphNodesToAdapterDocument(storeNodes) : undefined),
    [storeNodes]
  );

  return (
    <section
      role="region"
      aria-label="Visualize"
      data-testid="panel-visualPreview"
      data-component="workspace.visualPreview"
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      <Tabs defaultValue="graph" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <TabsList aria-label="View mode">
          <TabsTrigger value="graph">Graph</TabsTrigger>
          <TabsTrigger value="structure">Structure</TabsTrigger>
        </TabsList>

        <TabsContent value="graph" style={{ flex: 1, overflow: 'hidden' }}>
          {children ?? <p>The graph-focused modeling view mounts here.</p>}
        </TabsContent>

        <TabsContent value="structure" style={{ flex: 1, overflow: 'hidden' }}>
          <StructureView
            focusedTypeId={selectedNodeId ?? undefined}
            document={adapterDocument}
            expansionMap={expansionMap}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
