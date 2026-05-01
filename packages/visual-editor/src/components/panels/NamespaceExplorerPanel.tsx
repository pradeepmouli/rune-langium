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

import { useState, useMemo, useCallback, useRef, memo } from 'react';
import type { JSX } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  CircleDot,
  Circle,
  PlusSquare,
  MinusSquare,
  Package,
  GitBranch,
  Tag,
  FunctionSquare,
  Link,
  Layers,
  ArrowRightLeft,
  Atom,
  StickyNote
} from 'lucide-react';
import { Input } from '@rune-langium/design-system/ui/input';
import { Button } from '@rune-langium/design-system/ui/button';
import { Badge } from '@rune-langium/design-system/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@rune-langium/design-system/ui/tooltip';
import type { TypeGraphNode, TypeKind } from '../../types.js';
import { buildNamespaceTree, flattenNamespaceTree } from '../../utils/namespace-tree.js';
import type { FlatTreeRow } from '../../utils/namespace-tree.js';
import { useVirtualTree } from '../../hooks/useVirtualTree.js';

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
  /** Toggle an individual node's visibility. */
  onToggleNode: (nodeId: string) => void;
  /** Expand all namespaces. */
  onExpandAll: () => void;
  /** Collapse all namespaces. */
  onCollapseAll: () => void;
  /** Called when a node is clicked to select it in the graph. */
  onSelectNode?: (nodeId: string) => void;
  /** Currently selected node ID (for highlighting). */
  selectedNodeId?: string | null;
  /** Optional className for outer container. */
  className?: string;
  /** Total edge count for cross-namespace reference detection. */
  hiddenRefCounts?: Map<string, number>;
}

// ---------------------------------------------------------------------------
// Kind icon components
// ---------------------------------------------------------------------------

const KIND_ICON_MAP: Record<TypeKind, React.ElementType> = {
  data: Package,
  choice: GitBranch,
  enum: Tag,
  func: FunctionSquare,
  record: Layers,
  typeAlias: ArrowRightLeft,
  basicType: Atom,
  annotation: StickyNote
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
// Component
// ---------------------------------------------------------------------------

export const NamespaceExplorerPanel = memo(function NamespaceExplorerPanel({
  nodes,
  expandedNamespaces,
  hiddenNodeIds,
  selectedNodeId,
  onToggleNamespace,
  onToggleNode,
  onExpandAll,
  onCollapseAll,
  onSelectNode,
  className,
  hiddenRefCounts
}: NamespaceExplorerPanelProps): JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const [treeExpanded, setTreeExpanded] = useState<Set<string>>(
    () => new Set(nodes.map((n) => n.data.namespace))
  );
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
    () =>
      flattenNamespaceTree(
        fullTree,
        effectiveTreeExpanded,
        hiddenNodeIds,
        searchQuery || undefined
      ),
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
  const visibleCount = nodes.filter(
    (n) => expandedNamespaces.has(n.data.namespace) && !hiddenNodeIds.has(n.id)
  ).length;

  return (
    <TooltipProvider>
      <div
        className={`flex flex-col h-full bg-card ${className ?? ''}`}
        data-testid="namespace-explorer"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="min-w-0">
            <span className="text-sm font-semibold">Type explorer</span>
            <p className="text-[11px] text-muted-foreground">
              Browse namespaces and types in the active source.
            </p>
          </div>
          <Badge variant="secondary">
            {visibleCount}/{totalTypes}
          </Badge>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b">
          <Input
            type="text"
            placeholder="Filter types or namespaces..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 text-xs"
            data-testid="namespace-search"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" onClick={onExpandAll} data-testid="expand-all">
                <PlusSquare className="size-4" />
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
              >
                <MinusSquare className="size-4" />
                <span className="sr-only">Hide all</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Hide all namespaces from graph</TooltipContent>
          </Tooltip>
        </div>

        {/* Virtualized Tree */}
        <div ref={scrollRef} className="flex-1 overflow-auto" data-testid="namespace-tree">
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
                        onToggleGraphVisibility={() => onToggleNamespace(row.namespace)}
                        onToggleTreeExpand={() => toggleTreeExpand(row.namespace)}
                      />
                    ) : (
                      <TypeItemRow
                        row={row}
                        isGraphVisible={expandedNamespaces.has(row.namespace)}
                        isSelected={row.nodeId === selectedNodeId}
                        refCount={hiddenRefCounts?.get(row.nodeId) ?? 0}
                        onToggleNode={() => onToggleNode(row.nodeId)}
                        onSelectNode={() => onSelectNode?.(row.nodeId)}
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
  isGraphVisible: boolean;
  onToggleGraphVisibility: () => void;
  onToggleTreeExpand: () => void;
}

function NamespaceHeaderRow({
  row,
  isGraphVisible,
  onToggleGraphVisibility,
  onToggleTreeExpand
}: NamespaceHeaderRowProps): JSX.Element {
  return (
    <div data-testid={`ns-row-${row.namespace}`}>
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
          {row.expanded ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onToggleGraphVisibility}
              aria-label={isGraphVisible ? 'Hide namespace from graph' : 'Show namespace on graph'}
              className="shrink-0"
            >
              {isGraphVisible ? (
                <Eye className="size-3.5" />
              ) : (
                <EyeOff className="size-3.5 text-muted-foreground" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isGraphVisible ? 'Hide from graph' : 'Show on graph'}</TooltipContent>
        </Tooltip>

        <span
          className="flex-1 truncate text-xs font-medium cursor-pointer"
          onClick={onToggleTreeExpand}
        >
          {row.namespace}
        </span>

        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {row.typeCount}
        </Badge>
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
  onToggleNode: () => void;
  onSelectNode: () => void;
}

function TypeItemRow({
  row,
  isGraphVisible,
  isSelected,
  refCount,
  onToggleNode,
  onSelectNode
}: TypeItemRowProps): JSX.Element {
  const isVisible = isGraphVisible && !row.hidden;
  const KindIcon = KIND_ICON_MAP[row.typeKind];

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-0.5 ml-4 text-xs hover:bg-accent/50 ${
        isSelected
          ? 'bg-accent text-accent-foreground'
          : isVisible
            ? 'text-foreground'
            : 'text-muted-foreground opacity-60'
      }`}
      data-testid={`ns-type-${row.nodeId}`}
    >
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onToggleNode}
        disabled={!isGraphVisible}
        aria-label={row.hidden ? 'Show type' : 'Hide type'}
        className="shrink-0 size-5"
      >
        {isVisible ? <CircleDot className="size-3" /> : <Circle className="size-3" />}
      </Button>

      <KindIcon className="size-3.5 shrink-0 text-muted-foreground" />

      <span
        className="flex-1 truncate cursor-pointer hover:underline"
        onClick={onSelectNode}
        title={`${row.name} [${KIND_LABELS[row.typeKind]}]`}
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

      <span className="text-[10px] text-muted-foreground shrink-0">
        {KIND_LABELS[row.typeKind]}
      </span>
    </div>
  );
}
