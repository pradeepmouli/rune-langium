/**
 * TypeLink — Clickable type reference that navigates to a type definition.
 *
 * Renders a type name as a button-styled link. When clicked, resolves the
 * type to a graph node ID and calls onNavigateToNode.
 *
 * @module
 */

import type { NavigateToNodeCallback } from '../../types.js';

export interface TypeLinkProps {
  /** The type name to display (e.g., "Quantity", "CompareOp"). */
  typeName: string | undefined;
  /** Callback to navigate to the type's graph node. */
  onNavigateToNode?: NavigateToNodeCallback;
  /** All loaded graph nodes for resolving type name → node ID. */
  allNodeIds?: string[];
  /** Additional CSS classes. */
  className?: string;
}

/**
 * Resolve a short type name to a full node ID (namespace::name).
 * Searches allNodeIds for a match ending with ::typeName.
 */
function resolveNodeId(typeName: string, allNodeIds: string[]): string | undefined {
  // Exact match first (already fully qualified)
  if (allNodeIds.includes(typeName)) return typeName;
  // Search for ::typeName suffix
  return allNodeIds.find((id) => id.endsWith(`::${typeName}`));
}

export function TypeLink({ typeName, onNavigateToNode, allNodeIds, className }: TypeLinkProps) {
  if (!typeName) return null;

  // If no navigation callback, render as plain text
  if (!onNavigateToNode) {
    return <span className={className}>{typeName}</span>;
  }

  // Resolve once per render — avoids duplicate linear scans
  const resolvedNodeId = allNodeIds ? resolveNodeId(typeName, allNodeIds) : undefined;
  const isResolvable = !!resolvedNodeId;

  const handleClick = () => {
    if (resolvedNodeId) {
      onNavigateToNode(resolvedNodeId);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${className ?? ''} ${
        isResolvable ? 'text-primary hover:underline cursor-pointer' : ''
      }`.trim()}
      title={isResolvable ? `Go to ${typeName}` : typeName}
      disabled={!isResolvable}
    >
      {typeName}
    </button>
  );
}
