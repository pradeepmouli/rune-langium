// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * NamespaceExplorerPanel — Tree-based namespace navigation panel.
 *
 * Renders a collapsible tree grouped by namespace. Expanding/collapsing
 * a namespace correlates with showing/hiding its types on the graph canvas.
 *
 * Uses @tanstack/react-virtual for virtualized rendering of large trees
 * and shadcn/ui primitives with lucide-react icons.
 */

import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react';
import type { JSX, DragEvent, MouseEvent, KeyboardEvent } from 'react';
// KeyboardEvent stays imported — the nav button still needs handleNavKeyDown
// to stop Enter/Space from bubbling. Only the row-level keydown was dropped.
import { ArrowUpRight, ChevronRight, ChevronDown, PlusSquare, MinusSquare, Link, Search } from 'lucide-react';
import { Input } from '@rune-langium/design-system/ui/input';
import { Button } from '@rune-langium/design-system/ui/button';
import { IconButtonGroup } from '@rune-langium/design-system/ui/icon-button-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@rune-langium/design-system/ui/tooltip';
import { KindBadge, KIND_LABEL } from '../KindBadge.js';
import type { TypeGraphNode, TypeKind } from '../../types.js';
import {
  buildSegmentedNamespaceTree,
  flattenSegmentedTree,
  filterSegmentedTree,
  ancestorPathsForMatches
} from '../../utils/namespace-tree.js';
import type { FlatTreeRow } from '../../utils/namespace-tree.js';
import { useVirtualTree } from '../../hooks/useVirtualTree.js';
import { TYPE_REF_PAYLOAD_MIME, typeRefMimeForKind } from '../../types/structure-view.js';
import type { TypeRefPayload, TypeRefKind } from '../../types/structure-view.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface NamespaceExplorerPanelProps {
  /** All graph nodes (full set, including hidden ones). */
  nodes: TypeGraphNode[];
  /** Set of currently expanded (visible) namespaces. */
  expandedNamespaces: Set<string>;
  /** Set of individually hidden node IDs. */
  hiddenNodeIds: Set<string>;
  /** Toggle a namespace's visibility on the graph. */
  onToggleNamespace: (namespace: string) => void;
  /** Expand all namespaces. */
  onExpandAll: () => void;
  /** Collapse all namespaces. */
  onCollapseAll: () => void;
  /** Called when the navigation button on a type row is clicked to select it in the graph. */
  onSelectNode?: (nodeId: string) => void;
  /** Currently selected node ID (for highlighting). */
  selectedNodeId?: string | null;
  /** Optional className for outer container. */
  className?: string;
  /** Total edge count for cross-namespace reference detection. */
  hiddenRefCounts?: Map<string, number>;
  /**
   * Canonical node id of the currently active drag source (used to render
   * the → arrow indicator next to the type name).
   */
  dragSourceId?: string;
  /**
   * Called when the user single-clicks the row body (or presses Enter/Space on it)
   * to mark this type as the active drag source. The row body is single-purpose:
   * drag-source mark only. Navigation is handled exclusively by the nav button.
   */
  onSetDragSource?: (payload: TypeRefPayload) => void;
  /**
   * Previously used for double-click undo-on-navigate; no longer consumed
   * internally after Phase 13 redesign (row body is single-purpose).
   * Retained on the interface for back-compat with EditorPage pass-through.
   */
  onClearDragSource?: () => void;
}

// ---------------------------------------------------------------------------
// typeKind → TypeRefPayload.kind mapping
//
// FlatTreeRow.typeKind uses lowercase TypeKind values ('data', 'choice', …)
// while TypeRefPayload.kind requires PascalCase literals. EVERY kind maps to a
// payload kind so every row is draggable — that avoids the WebKit/Safari
// behaviour where a non-draggable row falls back to a text/region selection on
// a drag attempt. Validity is enforced by each drop target's `accept` list, not
// here: Data/Choice/Enum/BasicType/Record/TypeAlias are valid attribute
// type-refs; Func/Annotation are draggable but accepted by no target (no-drop).
// ---------------------------------------------------------------------------

function toPayloadKind(typeKind: TypeKind): TypeRefKind {
  switch (typeKind) {
    case 'data':
      return 'Data';
    case 'choice':
      return 'Choice';
    case 'enum':
      return 'Enum';
    case 'basicType':
      return 'BasicType';
    case 'record':
      return 'Record';
    case 'typeAlias':
      return 'TypeAlias';
    case 'func':
      return 'Func';
    case 'annotation':
      return 'Annotation';
    default: {
      // TypeKind is a closed union, so this is unreachable today. The `never`
      // assertion makes adding a new TypeKind a COMPILE error here (forcing an
      // explicit mapping) rather than silently misclassifying it as Annotation.
      const _exhaustive: never = typeKind;
      void _exhaustive;
      return 'Annotation';
    }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const NamespaceExplorerPanel = memo(function NamespaceExplorerPanel({
  nodes,
  expandedNamespaces,
  hiddenNodeIds,
  selectedNodeId,
  // Copilot review: `onToggleNamespace` is intentionally unused inside the
  // panel after the e2e-batch Eye/EyeOff button removal. The prop is kept
  // on the public interface as a no-op pass-through so callers (currently
  // EditorPage) don't need to thread different props for the panel vs.
  // the Graph filter menu that still consumes the action.
  onToggleNamespace: _onToggleNamespace,
  onExpandAll,
  onCollapseAll,
  onSelectNode,
  className,
  hiddenRefCounts,
  dragSourceId,
  onSetDragSource,
  onClearDragSource
}: NamespaceExplorerPanelProps): JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Build the segmented namespace tree.
  const segmentedRoots = useMemo(() => buildSegmentedNamespaceTree(nodes), [nodes]);

  // Default expansion: expand all depth-0 and depth-1 segments so the tree is
  // usable on first render without collapsing all the way to bare root segments.
  const [treeExpanded, setTreeExpanded] = useState<Set<string>>(() => {
    const roots = buildSegmentedNamespaceTree(nodes);
    const initial = new Set<string>();
    for (const root of roots) {
      initial.add(root.fullPath);
      for (const child of root.children) {
        initial.add(child.fullPath);
      }
    }
    return initial;
  });

  // Compute effective tree expansion (auto-expand all ancestor paths when searching).
  const effectiveTreeExpanded = useMemo(() => {
    if (searchQuery.trim()) {
      return ancestorPathsForMatches(segmentedRoots, searchQuery);
    }
    return treeExpanded;
  }, [searchQuery, treeExpanded, segmentedRoots]);

  // Apply search filter to the segmented tree.
  const filteredRoots = useMemo(() => {
    if (!searchQuery.trim()) return segmentedRoots;
    return filterSegmentedTree(segmentedRoots, searchQuery);
  }, [segmentedRoots, searchQuery]);

  // Flatten for virtualization.
  const flatRows = useMemo((): FlatTreeRow[] => {
    const rows = flattenSegmentedTree(filteredRoots, effectiveTreeExpanded);
    // Re-apply hidden flag to type rows (flattenSegmentedTree always sets hidden=false).
    return rows.map((row) => {
      if (row.kind === 'type' && hiddenNodeIds.has(row.nodeId)) {
        return { ...row, hidden: true };
      }
      return row;
    });
  }, [filteredRoots, effectiveTreeExpanded, hiddenNodeIds]);

  const virtualizer = useVirtualTree(flatRows, scrollRef);

  // Toggle tree expansion (UI-only, not graph visibility).
  const toggleTreeExpand = useCallback((fullPath: string) => {
    setTreeExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(fullPath)) {
        next.delete(fullPath);
      } else {
        next.add(fullPath);
      }
      return next;
    });
  }, []);

  const totalTypes = nodes.length;
  const visibleCount = nodes.filter((n) => expandedNamespaces.has(n.data.namespace) && !hiddenNodeIds.has(n.id)).length;

  return (
    <TooltipProvider>
      <div className={`flex flex-col h-full bg-card ${className ?? ''}`} data-testid="namespace-explorer">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="min-w-0">
            <span className="text-sm font-semibold">Type explorer</span>
            <p className="text-[11px] text-muted-foreground">Browse namespaces and types in the active source.</p>
          </div>
          <span className="number-chiclet" data-testid="namespace-explorer-count">
            {visibleCount}/{totalTypes}
          </span>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/80" />
            <Input
              type="text"
              placeholder="Filter types or namespaces..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 border-border/70 bg-background/55 pl-8 pr-2 text-[11px] shadow-none placeholder:text-muted-foreground/70"
              data-testid="namespace-search"
            />
          </div>
          <IconButtonGroup>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onExpandAll}
                    data-testid="expand-all"
                    className="rounded-full text-muted-foreground hover:bg-background/80 hover:text-foreground"
                  >
                    <PlusSquare className="size-3.5" />
                    <span className="sr-only">Show all</span>
                  </Button>
                }
              />
              <TooltipContent>Show all namespaces on graph</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onCollapseAll}
                    data-testid="collapse-all"
                    className="rounded-full text-muted-foreground hover:bg-background/80 hover:text-foreground"
                  >
                    <MinusSquare className="size-3.5" />
                    <span className="sr-only">Hide all</span>
                  </Button>
                }
              />
              <TooltipContent>Hide all namespaces from graph</TooltipContent>
            </Tooltip>
          </IconButtonGroup>
        </div>

        {/* Virtualized Tree.
         *
         * `studio-scroll` is the shared scrollbar-chrome class defined in
         * apps/studio/src/styles.css. It uses native ::-webkit-scrollbar +
         * scrollbar-* properties so the scrollbar is fully draggable and
         * click-to-page works — see PR commit message for the click-through
         * root cause (was: wrapped in a redundant Radix ScrollArea). */}
        <div ref={scrollRef} className="studio-scroll flex-1 overflow-auto" data-testid="namespace-tree">
          {flatRows.length === 0 && (
            <p className="px-3 py-4 text-xs text-center text-muted-foreground">
              {searchQuery ? 'No matching types or namespaces' : 'No types loaded'}
            </p>
          )}
          {flatRows.length > 0 && (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative'
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const row = flatRows[virtualRow.index]!;
                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: 'absolute',
                      // Position via `top`, NOT `transform: translateY(...)`.
                      // WebKit/Safari refuses to initiate native HTML5 drag on a
                      // `draggable` element whose ancestor has a CSS transform, so
                      // the @tanstack/react-virtual default transform broke drag of
                      // every TypeItemRow in Safari (Chrome has no such bug). Using
                      // `top` keeps the rows free of a transformed ancestor.
                      top: `${virtualRow.start}px`,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`
                    }}
                  >
                    {row.kind === 'namespace' ? (
                      <NamespaceHeaderRow
                        row={row}
                        isGraphVisible={expandedNamespaces.has(row.namespace)}
                        onToggleTreeExpand={() => toggleTreeExpand(row.namespace)}
                      />
                    ) : row.kind === 'segment' ? (
                      <SegmentHeaderRow
                        row={row}
                        onToggleTreeExpand={() => toggleTreeExpand(row.fullPath)}
                      />
                    ) : row.kind === 'type' ? (
                      <TypeItemRow
                        row={row}
                        isGraphVisible={expandedNamespaces.has(row.namespace)}
                        isSelected={row.nodeId === selectedNodeId}
                        refCount={hiddenRefCounts?.get(row.nodeId) ?? 0}
                        onSelectNode={() => onSelectNode?.(row.nodeId)}
                        isDragSource={dragSourceId === row.nodeId}
                        onSetDragSource={onSetDragSource}
                        // onClearDragSource is intentionally NOT forwarded — the TypeItemRow
                        // no longer uses it. The panel-level prop is kept for back-compat only.
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
});

// ---------------------------------------------------------------------------
// NamespaceHeaderRow — a namespace header in the virtualized list
// ---------------------------------------------------------------------------

interface NamespaceHeaderRowProps {
  row: Extract<FlatTreeRow, { kind: 'namespace' }>;
  /**
   * Whether this namespace is currently visible in the Graph view. Kept for
   * styling the row's text color (visible → foreground, hidden → muted) so
   * users can see at a glance which namespaces the Graph filter has hidden.
   * Toggle UI for visibility was removed from the explorer (e2e-batch fix):
   * visibility is a Graph-only concept, managed via the Graph filter menu.
   */
  isGraphVisible: boolean;
  onToggleTreeExpand: () => void;
}

function NamespaceHeaderRow({ row, isGraphVisible, onToggleTreeExpand }: NamespaceHeaderRowProps): JSX.Element {
  // e2e-batch fix #11: signal that this namespace contains draggable items.
  // A subtle "grip" affordance appears on hover so users discover that types
  // INSIDE the namespace can be dragged to drop targets (Structure rows,
  // Source editor). The namespace header itself isn't draggable today —
  // that would need a new NamespaceRef payload kind — but the hover hint
  // points users toward the per-type drag affordance once expanded.
  return (
    <div data-testid={`ns-row-${row.namespace}`} className="group">
      <div
        className={`flex items-center gap-1 px-2 py-1 text-sm hover:bg-accent/50 cursor-default ${
          isGraphVisible ? 'text-foreground' : 'text-muted-foreground'
        }`}
      >
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onToggleTreeExpand}
          aria-label={row.expanded ? 'Collapse tree' : 'Expand tree'}
          className="shrink-0"
        >
          {row.expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </Button>

        <span className="flex-1 truncate text-xs font-medium cursor-pointer" onClick={onToggleTreeExpand}>
          {row.namespace}
        </span>

        {/* Drag-source affordance hint (hover-only). Subtle ⋮⋮ icon signals to
            the user that types inside are draggable. Stays hidden until hover
            so it doesn't compete visually with the type-count chiclet. */}
        <span
          className="shrink-0 px-1 text-[10px] leading-none text-muted-foreground/60 opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden="true"
          title="Types in this namespace can be dragged onto Structure rows or the Source editor"
        >
          ⋮⋮
        </span>

        <span className="number-chiclet">{row.typeCount}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SegmentHeaderRow — a nested segment header in the segmented tree
// ---------------------------------------------------------------------------

interface SegmentHeaderRowProps {
  row: Extract<FlatTreeRow, { kind: 'segment' }>;
  onToggleTreeExpand: () => void;
}

function SegmentHeaderRow({ row, onToggleTreeExpand }: SegmentHeaderRowProps): JSX.Element {
  const indentPx = row.depth * 12;
  const totalCount = row.typeCount + (row.childCount > 0 ? row.childCount : 0);
  return (
    <div data-testid={`ns-seg-${row.fullPath}`} className="group">
      <div
        className="flex items-center gap-1 px-2 py-1 text-sm hover:bg-accent/50 cursor-default text-foreground"
        style={{ paddingLeft: `${8 + indentPx}px` }}
      >
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onToggleTreeExpand}
          aria-label={row.expanded ? 'Collapse segment' : 'Expand segment'}
          className="shrink-0"
        >
          {row.expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </Button>

        <span className="flex-1 truncate text-xs font-medium cursor-pointer" onClick={onToggleTreeExpand}>
          {row.segment || '(default)'}
        </span>

        <span className="number-chiclet shrink-0">{totalCount}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TypeItemRow — a type item in the virtualized list
// ---------------------------------------------------------------------------

interface TypeItemRowProps {
  row: Extract<FlatTreeRow, { kind: 'type' }>;
  isGraphVisible: boolean;
  isSelected: boolean;
  refCount: number;
  onSelectNode: () => void;
  /** True when this row is the currently active drag source. */
  isDragSource: boolean;
  /**
   * Called on single-click on the row body (or Enter/Space on the row) to
   * mark this type as the active drag source. The row body is single-purpose.
   */
  onSetDragSource?: (payload: TypeRefPayload) => void;
  // onClearDragSource is intentionally omitted — the TypeItemRow no longer
  // needs it. The panel-level prop is kept for interface back-compat only.
}

function TypeItemRow({
  row,
  // isGraphVisible / isDragSource / onSetDragSource intentionally
  // unused: the dim "hidden in graph" treatment and click-to-mark-as-
  // drag-source feature were removed by user iteration so the only
  // operations in the explorer are drag (HTML5 native) or click the
  // navigate arrow. The props stay on TypeItemRowProps so parent
  // wiring (EditorPage / tests) doesn't have to change.
  isGraphVisible: _isGraphVisible,
  isSelected,
  refCount,
  onSelectNode,
  isDragSource: _isDragSource,
  onSetDragSource: _onSetDragSource
}: TypeItemRowProps): JSX.Element {
  // Every kind maps to a payload kind, so every row is a drag source. That
  // avoids the WebKit fallback where a non-draggable row text/region-selects on
  // a drag attempt. Whether a drop is valid is decided by each target's
  // `accept` list (Func/Annotation are draggable but accepted nowhere).
  const payload: TypeRefPayload = {
    rune: 'type-ref',
    // FlatTreeRow uses 'namespace' (the namespace string); TypeRefPayload
    // calls this field 'namespaceUri'. They represent the same value.
    namespaceUri: row.namespace,
    typeId: row.nodeId,
    typeName: row.name,
    kind: toPayloadKind(row.typeKind)
  };

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    // Dual-MIME contract per Phase 4: canonical MIME carries the JSON payload;
    // kind-specific marker MIME is registered with an empty value so that drop
    // targets can filter by kind during dragover (when getData is unavailable).
    e.dataTransfer.setData(TYPE_REF_PAYLOAD_MIME, JSON.stringify(payload));
    e.dataTransfer.setData(typeRefMimeForKind(payload.kind), '');
    e.dataTransfer.effectAllowed = 'link';
  };

  // P2 a11y review (PR #210): the row body no longer advertises button
  // semantics. The previous `role="button"` + `tabIndex={0}` + Enter/Space
  // handler combination announced the row as an interactive control to AT,
  // but the mouse-click path had been intentionally removed (drag-source-
  // mark gone; navigation is now the nav-arrow button's sole responsibility).
  // Keeping the keyboard activation alive while removing mouse activation
  // produced inconsistent affordances across input modalities. The row is
  // now a plain `<div>` — the embedded nav-arrow `<button>` is the only
  // interactive element, and it is independently keyboard-focusable
  // (tabIndex=0, descriptive aria-label).

  // Nav-click triggers selection AND flashes the row briefly so the user
  // gets confirmation that the navigate fired — without it the explorer
  // and other panes update silently and you can't tell if your click was
  // registered. 500ms cleanup is enough for the eye to catch the pulse
  // without lingering past the next intent.
  const [justNavigated, setJustNavigated] = useState(false);
  useEffect(() => {
    if (!justNavigated) return;
    const id = window.setTimeout(() => setJustNavigated(false), 500);
    return () => window.clearTimeout(id);
  }, [justNavigated]);

  const handleNavClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onSelectNode();
      setJustNavigated(true);
    },
    [onSelectNode]
  );

  // Keep the row's keydown from also firing when the nav button has focus
  // and Enter/Space is pressed — the button's own click activation already
  // covers that path.
  const handleNavKeyDown = useCallback((e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.stopPropagation();
    }
  }, []);

  // Depth-aware indentation: segment tree rows carry a `depth` field (0 = root).
  // We add 12px per level on top of the baseline 16px (ml-4) left padding.
  // Rows from the old flat tree have depth=undefined → baseline indent only.
  const depthIndentPx = (row.depth ?? 0) * 12;

  return (
    <div
      className={`studio-type-row group relative flex cursor-grab items-center gap-1.5 px-2 py-0.5 text-xs text-foreground hover:bg-accent/50${
        isSelected ? ' studio-type-row--selected' : ''
      }${justNavigated ? ' studio-type-row--just-navigated' : ''}`}
      style={{ paddingLeft: `${16 + depthIndentPx}px` }}
      data-testid={`ns-type-${row.nodeId}`}
      // Row is a drag source only — click no longer marks anything; the
      // only operation is dragging (visual cursor: grab signals it) or
      // clicking the navigate arrow on the right edge. The dim "hidden
      // in graph" treatment was removed per user feedback ("doesn't
      // accomplish anything and is confusing") so every row looks the
      // same regardless of graph visibility state.
      //
      // P2 a11y (PR #210): no role/tabIndex/keydown — the row is not a
      // button semantically. The nav-arrow inside is the interactive element.
      draggable
      onDragStart={handleDragStart}
    >
      {isSelected && <span className="studio-type-pip" />}

      <KindBadge kind={row.typeKind} shape="glyph" />

      {/* Plain span — no click handler, no hover underline. The only
          link-like affordance in the row is the nav arrow on the right.
          Title text describes the only two operations: drag or click
          the arrow. */}
      <span
        className="flex-1 truncate text-left"
        title={`${row.name} [${KIND_LABEL[row.typeKind]}] — drag to add as a type ref, or click the arrow to open`}
      >
        {row.name}
      </span>

      {refCount > 0 && (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                <Link className="size-3" />
                <span className="text-[10px]">{refCount}</span>
              </span>
            }
          />
          <TooltipContent>{refCount} hidden reference(s)</TooltipContent>
        </Tooltip>
      )}

      {/* Navigation button — the ONLY click-actionable element in the
          row. Diagonal up-right arrow (ArrowUpRight) is the canonical
          "open / navigate to" affordance; ChevronRight read as "expand
          / next" which was misleading. Always visible at low opacity so
          users see the affordance without hover-discovery.

          DS `Button variant="ghost"` (same primitive the Show-all/Hide-all
          toolbar uses) for the focus ring + hover + disabled semantics.
          Sized up to size-6 (24px) with a border: the default icon-xs (16px)
          was too small a hit target to click reliably. The opacity-fade
          affordance is layered on via className. */}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={handleNavClick}
        onKeyDown={handleNavKeyDown}
        aria-label={`Navigate to ${row.name}`}
        data-testid={`ns-type-nav-${row.nodeId}`}
        className="ml-auto size-6 border border-border/60 opacity-40 transition-opacity hover:border-border hover:!opacity-100 focus:opacity-100 group-hover:opacity-80"
        tabIndex={0}
      >
        <ArrowUpRight className="size-3.5" />
      </Button>
    </div>
  );
}
