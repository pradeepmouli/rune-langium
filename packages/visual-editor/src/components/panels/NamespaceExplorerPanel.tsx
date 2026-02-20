/**
 * NamespaceExplorerPanel — Tree-based namespace navigation panel.
 *
 * Renders a collapsible tree grouped by namespace. Expanding/collapsing
 * a namespace correlates with showing/hiding its types on the graph canvas.
 *
 * Uses shadcn/ui primitives and lucide-react icons.
 */

import { useState, useMemo, useCallback } from 'react';
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
import { ScrollArea } from '@rune-langium/design-system/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@rune-langium/design-system/ui/tooltip';
import type { TypeGraphNode, NamespaceTreeNode, TypeKind } from '../../types.js';
import { buildNamespaceTree, filterNamespaceTree } from '../../utils/namespace-tree.js';

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

export function NamespaceExplorerPanel({
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

  // Build and filter the namespace tree
  const fullTree = useMemo(() => buildNamespaceTree(nodes), [nodes]);
  const filteredTree = useMemo(
    () => filterNamespaceTree(fullTree, searchQuery),
    [fullTree, searchQuery]
  );

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

  // When search is active, auto-expand tree items
  const isTreeExpanded = useCallback(
    (namespace: string): boolean => {
      if (searchQuery.trim()) return true;
      return treeExpanded.has(namespace);
    },
    [searchQuery, treeExpanded]
  );

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
          <span className="text-sm font-semibold">Explorer</span>
          <Badge variant="secondary">
            {visibleCount}/{totalTypes}
          </Badge>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b">
          <Input
            type="text"
            placeholder="Filter namespaces..."
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

        {/* Tree */}
        <ScrollArea className="flex-1">
          <div className="py-1" data-testid="namespace-tree">
            {filteredTree.length === 0 && (
              <p className="px-3 py-4 text-xs text-center text-muted-foreground">
                {searchQuery ? 'No matching namespaces' : 'No types loaded'}
              </p>
            )}
            {filteredTree.map((entry) => (
              <NamespaceRow
                key={entry.namespace}
                entry={entry}
                isGraphVisible={expandedNamespaces.has(entry.namespace)}
                isTreeExpanded={isTreeExpanded(entry.namespace)}
                hiddenNodeIds={hiddenNodeIds}
                hiddenRefCounts={hiddenRefCounts}
                onToggleGraphVisibility={() => onToggleNamespace(entry.namespace)}
                onToggleTreeExpand={() => toggleTreeExpand(entry.namespace)}
                onToggleNode={onToggleNode}
                onSelectNode={onSelectNode}
                selectedNodeId={selectedNodeId}
              />
            ))}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// NamespaceRow — a single namespace in the tree
// ---------------------------------------------------------------------------

interface NamespaceRowProps {
  entry: NamespaceTreeNode;
  isGraphVisible: boolean;
  isTreeExpanded: boolean;
  hiddenNodeIds: Set<string>;
  hiddenRefCounts?: Map<string, number>;
  selectedNodeId?: string | null;
  onToggleGraphVisibility: () => void;
  onToggleTreeExpand: () => void;
  onToggleNode: (nodeId: string) => void;
  onSelectNode?: (nodeId: string) => void;
}

function NamespaceRow({
  entry,
  isGraphVisible,
  isTreeExpanded,
  hiddenNodeIds,
  hiddenRefCounts,
  selectedNodeId,
  onToggleGraphVisibility,
  onToggleTreeExpand,
  onToggleNode,
  onSelectNode
}: NamespaceRowProps): JSX.Element {
  return (
    <div data-testid={`ns-row-${entry.namespace}`}>
      <div
        className={`flex items-center gap-1 px-2 py-1 text-sm hover:bg-accent/50 cursor-default ${
          isGraphVisible ? 'text-foreground' : 'text-muted-foreground'
        }`}
      >
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onToggleTreeExpand}
          aria-label={isTreeExpanded ? 'Collapse tree' : 'Expand tree'}
          className="shrink-0"
        >
          {isTreeExpanded ? (
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
          {entry.namespace}
        </span>

        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {entry.totalCount}
        </Badge>
      </div>

      {isTreeExpanded && (
        <div className="ml-4">
          {entry.types.map((type) => {
            const isHidden = hiddenNodeIds.has(type.nodeId);
            const isVisible = isGraphVisible && !isHidden;
            const refCount = hiddenRefCounts?.get(type.nodeId) ?? 0;
            const KindIcon = KIND_ICON_MAP[type.kind];

            const isSelected = type.nodeId === selectedNodeId;

            return (
              <div
                key={type.nodeId}
                className={`flex items-center gap-1.5 px-2 py-0.5 text-xs hover:bg-accent/50 ${
                  isSelected
                    ? 'bg-accent text-accent-foreground'
                    : isVisible
                      ? 'text-foreground'
                      : 'text-muted-foreground opacity-60'
                }`}
                data-testid={`ns-type-${type.nodeId}`}
              >
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onToggleNode(type.nodeId)}
                  disabled={!isGraphVisible}
                  aria-label={isHidden ? 'Show type' : 'Hide type'}
                  className="shrink-0 size-5"
                >
                  {isVisible ? <CircleDot className="size-3" /> : <Circle className="size-3" />}
                </Button>

                <KindIcon className="size-3.5 shrink-0 text-muted-foreground" />

                <span
                  className="flex-1 truncate cursor-pointer hover:underline"
                  onClick={() => onSelectNode?.(type.nodeId)}
                  title={`${type.name} [${KIND_LABELS[type.kind]}]`}
                >
                  {type.name}
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
                  {KIND_LABELS[type.kind]}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
