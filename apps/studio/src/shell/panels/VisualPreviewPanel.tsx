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
 * Choice arms are mapped to `AdapterChoiceOption` (real ChoiceOption shape —
 * `typeCall` only, no synthesized `name`/`card`). This helper is intentionally
 * local to this file; it should NOT be added to the editor-store because it
 * encodes a display-specific projection that is only needed by the Structure
 * View. If a future use case (e.g., LSP hover) needs the same projection,
 * extract it to a shared `adapter-document.ts` then.
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
import type { AdapterChoiceOption, AdapterDocument, AdapterNode } from '@rune-langium/visual-editor';
import type { AnyGraphNode } from '@rune-langium/visual-editor';
import { useStructureViewStore } from '../../store/structure-view-store.js';

// ---------------------------------------------------------------------------
// Adapter: TypeGraphNode[] → AdapterDocument
// ---------------------------------------------------------------------------

/**
 * Project the editor store's node array into the AdapterDocument shape.
 *
 * Only `Data`, `Choice`, and `Enum` nodes are included. `superType.$refText`
 * maps to `extends`; Data `attributes` carry through to `AdapterAttribute`
 * directly since their fields match. Choice arms are mapped to the new
 * `choiceOptions` field on `AdapterNode`, preserving the real `ChoiceOption`
 * AST shape (only `typeCall`, no synthesized `name` or `card`).
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
        attributes: (d.attributes ?? []) satisfies AdapterNode['attributes']
      });
    } else if (d.$type === 'Choice') {
      // ChoiceOption AST shape: { $type, typeCall, … } — NO `name`, NO `card`.
      // Pass through to the new `choiceOptions` field on AdapterNode unchanged.
      // The adapter's buildChoiceArm consumes the real shape via typeCall only.
      adapterNodes.push({
        id: rfNode.id,
        $type: 'Choice',
        name: d.name,
        namespace: d.namespace,
        choiceOptions: (d.attributes ?? []) as ReadonlyArray<AdapterChoiceOption>
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

  // Derive the $type of the currently-selected node so we can gate which ids
  // get forwarded to StructureView as focusedTypeId. Using two separate selectors
  // (selectedNodeId above, then a find below) avoids breaking zustand's
  // referential-equality optimisation that would fire on every nodes mutation.
  //
  // Only Data / Choice / Enum nodes are projected into adapterDocument.  When
  // the user selects a Function, RecordType, TypeAlias, BasicType or Annotation
  // node we pass `undefined` so StructureView shows its empty-selection state
  // rather than the "stale selection" message (which is misleading — the node
  // exists, it's just an unsupported kind for structure display).
  const selectedNodeType = useEditorStore((s) => {
    if (!s.selectedNodeId) return null;
    const node = s.nodes.find((n) => n.id === s.selectedNodeId);
    return (node?.data as { $type?: string } | undefined)?.$type ?? null;
  });

  const focusedTypeId = useMemo(() => {
    if (!selectedNodeId) return undefined;
    if (selectedNodeType === 'Data' || selectedNodeType === 'Choice' || selectedNodeType === 'RosettaEnumeration')
      return selectedNodeId;
    // Unsupported kind — do not forward to StructureView; let the empty state render.
    return undefined;
  }, [selectedNodeId, selectedNodeType]);

  // Structure view store — expansion state (drag-source consumption is a Phase 8 concern,
  // see the Phase 8 TODO block at the top of this file)
  const expansionMap = useStructureViewStore((s) => s.expansionMap);

  // expansionMap is intentionally excluded — adapterDocument only changes when AST nodes change; expansion-only changes re-run the cheaper inner memo in StructureFlowInner.
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
          <TabsTrigger value="graph" data-testid="tab-graph">
            Graph
          </TabsTrigger>
          <TabsTrigger value="structure" data-testid="tab-structure">
            Structure
          </TabsTrigger>
        </TabsList>

        <TabsContent forceMount value="graph" className="flex-1 overflow-hidden data-[state=inactive]:hidden">
          {children ?? <p>The graph-focused modeling view mounts here.</p>}
        </TabsContent>

        <TabsContent forceMount value="structure" className="flex-1 overflow-hidden data-[state=inactive]:hidden">
          <StructureView focusedTypeId={focusedTypeId} adapterDoc={adapterDocument} expansionMap={expansionMap} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
