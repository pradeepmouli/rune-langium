/**
 * NamespaceExplorerPanel — Tree-based namespace navigation panel.
 *
 * Renders a collapsible tree grouped by namespace. Expanding/collapsing
 * a namespace correlates with showing/hiding its types on the graph canvas.
 */

import { useState, useMemo, useCallback } from 'react';
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
  /** Optional className for outer container. */
  className?: string;
  /** Total edge count for cross-namespace reference detection. */
  hiddenRefCounts?: Map<string, number>;
}

// ---------------------------------------------------------------------------
// Kind icons
// ---------------------------------------------------------------------------

const KIND_ICONS: Record<TypeKind, string> = {
  data: '\u{1F4E6}', // 📦
  choice: '\u{1F500}', // 🔀
  enum: '\u{1F3F7}', // 🏷️
  func: '\u{1D453}' // 𝑓
};

const KIND_LABELS: Record<TypeKind, string> = {
  data: 'Data',
  choice: 'Choice',
  enum: 'Enum',
  func: 'Function'
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NamespaceExplorerPanel({
  nodes,
  expandedNamespaces,
  hiddenNodeIds,
  onToggleNamespace,
  onToggleNode,
  onExpandAll,
  onCollapseAll,
  onSelectNode,
  className,
  hiddenRefCounts
}: NamespaceExplorerPanelProps): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const [treeExpanded, setTreeExpanded] = useState<Set<string>>(new Set());

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
    <div className={`ns-explorer ${className ?? ''}`} data-testid="namespace-explorer">
      {/* Header */}
      <div className="ns-explorer__header">
        <span className="ns-explorer__title">Explorer</span>
        <span className="ns-explorer__count">
          {visibleCount}/{totalTypes}
        </span>
      </div>

      {/* Toolbar */}
      <div className="ns-explorer__toolbar">
        <input
          type="text"
          className="ns-explorer__search"
          placeholder="Filter namespaces..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          data-testid="namespace-search"
        />
        <div className="ns-explorer__actions">
          <button
            className="ns-explorer__action-btn"
            onClick={onExpandAll}
            title="Show all namespaces on graph"
            data-testid="expand-all"
          >
            &#x229E;
          </button>
          <button
            className="ns-explorer__action-btn"
            onClick={onCollapseAll}
            title="Hide all namespaces from graph"
            data-testid="collapse-all"
          >
            &#x229F;
          </button>
        </div>
      </div>

      {/* Tree */}
      <div className="ns-explorer__tree" data-testid="namespace-tree">
        {filteredTree.length === 0 && (
          <div className="ns-explorer__empty">
            {searchQuery ? 'No matching namespaces' : 'No types loaded'}
          </div>
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
          />
        ))}
      </div>
    </div>
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
  onToggleGraphVisibility,
  onToggleTreeExpand,
  onToggleNode,
  onSelectNode
}: NamespaceRowProps): React.JSX.Element {
  return (
    <div className="ns-row" data-testid={`ns-row-${entry.namespace}`}>
      <div className={`ns-row__header ${isGraphVisible ? 'ns-row__header--visible' : ''}`}>
        <button
          className="ns-row__chevron"
          onClick={onToggleTreeExpand}
          aria-label={isTreeExpanded ? 'Collapse tree' : 'Expand tree'}
        >
          {isTreeExpanded ? '\u25BC' : '\u25B6'}
        </button>
        <button
          className="ns-row__visibility"
          onClick={onToggleGraphVisibility}
          title={isGraphVisible ? 'Hide from graph' : 'Show on graph'}
          aria-label={isGraphVisible ? 'Hide namespace from graph' : 'Show namespace on graph'}
        >
          {isGraphVisible ? '\u{1F441}' : '\u{1F441}\u{FE0F}\u{200D}\u{1F5E8}\u{FE0F}'}
        </button>
        <span className="ns-row__name" onClick={onToggleTreeExpand}>
          {entry.namespace}
        </span>
        <span className="ns-row__badge">{entry.totalCount}</span>
      </div>

      {isTreeExpanded && (
        <div className="ns-row__children">
          {entry.types.map((type) => {
            const isHidden = hiddenNodeIds.has(type.nodeId);
            const isVisible = isGraphVisible && !isHidden;
            const refCount = hiddenRefCounts?.get(type.nodeId) ?? 0;
            return (
              <div
                key={type.nodeId}
                className={`ns-type ${isVisible ? 'ns-type--visible' : 'ns-type--hidden'}`}
                data-testid={`ns-type-${type.nodeId}`}
              >
                <button
                  className="ns-type__visibility"
                  onClick={() => onToggleNode(type.nodeId)}
                  title={isHidden ? 'Show type' : 'Hide type'}
                  disabled={!isGraphVisible}
                >
                  {isVisible ? '\u25C9' : '\u25CB'}
                </button>
                <span className="ns-type__icon">{KIND_ICONS[type.kind]}</span>
                <span
                  className="ns-type__name"
                  onClick={() => onSelectNode?.(type.nodeId)}
                  title={`${type.name} [${KIND_LABELS[type.kind]}]`}
                >
                  {type.name}
                </span>
                {refCount > 0 && (
                  <span className="ns-type__ext-refs" title={`${refCount} hidden reference(s)`}>
                    &#x1F517;{refCount}
                  </span>
                )}
                <span className="ns-type__kind">{KIND_LABELS[type.kind]}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
