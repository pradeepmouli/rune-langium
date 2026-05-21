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
import type { TypeGraphNode, TypeKind } from '../../types.js';
import { buildNamespaceTree, flattenNamespaceTree } from '../../utils/namespace-tree.js';
import type { FlatTreeRow } from '../../utils/namespace-tree.js';
import { useVirtualTree } from '../../hooks/useVirtualTree.js';
import { TYPE_REF_PAYLOAD_MIME, typeRefMimeForKind } from '../../types/structure-view.js';
import type { TypeRefPayload } from '../../types/structure-view.js';

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
// Kind glyph components
// ---------------------------------------------------------------------------

const KIND_LETTER: Record<TypeKind, string> = {
  data: 'D',
  choice: 'C',
  enum: 'E',
  func: 'F',
  record: 'R',
  typeAlias: 'A',
  basicType: 'B',
  annotation: '@'
};

const KIND_COLOR_VAR: Record<TypeKind, string> = {
  data: 'var(--color-data)',
  choice: 'var(--color-choice)',
  enum: 'var(--color-enum)',
  func: 'var(--color-func)',
  record: 'var(--color-data)',
  typeAlias: 'var(--color-data)',
  basicType: 'var(--muted-foreground)',
  annotation: 'var(--color-enum)'
};

const KIND_LABELS: Record<TypeKind, string> = {
  data: 'Data',
  choice: 'Choice',
  enum: 'Enum',
  func: 'Function',
  record: 'Record',
  typeAlias: 'Type Alias',
  basicType: 'Basic Type',
  annotation: 'Annotation'
};

// ---------------------------------------------------------------------------
// typeKind → TypeRefPayload.kind mapping
//
// FlatTreeRow.typeKind uses lowercase TypeKind values ('data', 'choice', 'enum',
// 'basicType', …) while TypeRefPayload.kind requires PascalCase literals.
// Only the four kinds recognised by the payload spec are mappable; all others
// (func, record, typeAlias, annotation) return undefined so TypeItemRow can
// opt out of registering the drag payload for unsupported kinds.
// ---------------------------------------------------------------------------

function toPayloadKind(typeKind: TypeKind): TypeRefPayload['kind'] | undefined {
  switch (typeKind) {
    case 'data':
      return 'Data';
    case 'choice':
      return 'Choice';
    case 'enum':
      return 'Enum';
    case 'basicType':
      return 'BasicType';
    default:
      // func, record, typeAlias, annotation are not valid drag-source payload kinds.
      return undefined;
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
  const [treeExpanded, setTreeExpanded] = useState<Set<string>>(() => new Set(nodes.map((n) => n.data.namespace)));
  const scrollRef = useRef<HTMLDivElement>(null);

  // Build namespace tree
  const fullTree = useMemo(() => buildNamespaceTree(nodes), [nodes]);

  // Compute effective tree expansion (auto-expand all when searching)
  const effectiveTreeExpanded = useMemo(() => {
    if (searchQuery.trim()) {
      return new Set(fullTree.map((e) => e.namespace));
    }
    return treeExpanded;
  }, [searchQuery, treeExpanded, fullTree]);

  // Flatten for virtualization
  const flatRows = useMemo(
    () => flattenNamespaceTree(fullTree, effectiveTreeExpanded, hiddenNodeIds, searchQuery || undefined),
    [fullTree, effectiveTreeExpanded, hiddenNodeIds, searchQuery]
  );

  const virtualizer = useVirtualTree(flatRows, scrollRef);

  // Toggle tree expansion (UI-only, not visibility)
  const toggleTreeExpand = useCallback((namespace: string) => {
    setTreeExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(namespace)) {
        next.delete(namespace);
      } else {
        next.add(namespace);
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
              <TooltipTrigger asChild>
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
              </TooltipTrigger>
              <TooltipContent>Show all namespaces on graph</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
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
              </TooltipTrigger>
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
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`
                    }}
                  >
                    {row.kind === 'namespace' ? (
                      <NamespaceHeaderRow
                        row={row}
                        isGraphVisible={expandedNamespaces.has(row.namespace)}
                        onToggleTreeExpand={() => toggleTreeExpand(row.namespace)}
                      />
                    ) : (
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
                    )}
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
  // Build the payload kind once; undefined means this kind is not a valid drag source.
  const payloadKind = toPayloadKind(row.typeKind);

  const payload: TypeRefPayload | undefined = payloadKind
    ? {
        rune: 'type-ref',
        // FlatTreeRow uses 'namespace' (the namespace string); TypeRefPayload
        // calls this field 'namespaceUri'. They represent the same value.
        namespaceUri: row.namespace,
        typeId: row.nodeId,
        typeName: row.name,
        kind: payloadKind
      }
    : undefined;

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    if (!payload) {
      e.preventDefault();
      return;
    }
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

  return (
    <div
      className={`studio-type-row group relative ml-4 flex cursor-grab items-center gap-1.5 px-2 py-0.5 text-xs text-foreground hover:bg-accent/50${
        isSelected ? ' studio-type-row--selected' : ''
      }${justNavigated ? ' studio-type-row--just-navigated' : ''}`}
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
      draggable={payload !== undefined}
      onDragStart={handleDragStart}
    >
      {isSelected && <span className="studio-type-pip" />}

      <span
        className="studio-type-glyph"
        style={{
          color: KIND_COLOR_VAR[row.typeKind],
          background: `color-mix(in oklch, ${KIND_COLOR_VAR[row.typeKind]}, transparent 82%)`,
          borderColor: `color-mix(in oklch, ${KIND_COLOR_VAR[row.typeKind]}, transparent 60%)`
        }}
      >
        {KIND_LETTER[row.typeKind]}
      </span>

      {/* Plain span — no click handler, no hover underline. The only
          link-like affordance in the row is the nav arrow on the right.
          Title text describes the only two operations: drag or click
          the arrow. */}
      <span
        className="flex-1 truncate text-left"
        title={`${row.name} [${KIND_LABELS[row.typeKind]}] — drag to add as a type ref, or click the arrow to open`}
      >
        {row.name}
      </span>

      {refCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-0.5 text-muted-foreground">
              <Link className="size-3" />
              <span className="text-[10px]">{refCount}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>{refCount} hidden reference(s)</TooltipContent>
        </Tooltip>
      )}

      {/* Navigation button — the ONLY click-actionable element in the
          row. Diagonal up-right arrow (ArrowUpRight) is the canonical
          "open / navigate to" affordance; ChevronRight read as "expand
          / next" which was misleading. Always visible at low opacity so
          users see the affordance without hover-discovery.

          The icon alone is a 12px hit target — too small to click reliably.
          Wrap it in a 24px (size-6) bordered square so the whole button is
          clickable and reads as an actionable control. */}
      <button
        type="button"
        onClick={handleNavClick}
        onKeyDown={handleNavKeyDown}
        aria-label={`Navigate to ${row.name}`}
        data-testid={`ns-type-nav-${row.nodeId}`}
        className="ml-auto grid size-6 shrink-0 place-items-center rounded border border-border/60 opacity-40 transition-opacity hover:border-border hover:bg-background/60 hover:!opacity-100 focus:opacity-100 focus-visible:ring-1 focus-visible:ring-ring group-hover:opacity-80"
        tabIndex={0}
      >
        <ArrowUpRight className="size-3.5" />
      </button>
    </div>
  );
}
