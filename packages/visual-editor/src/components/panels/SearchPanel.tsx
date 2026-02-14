/**
 * SearchPanel — Search and filter UI panel.
 *
 * Provides a search input and filter controls for the graph.
 */

import { useCallback } from 'react';
import type { GraphFilters, TypeKind } from '../../types.js';

export interface SearchPanelProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filters: GraphFilters;
  onFiltersChange: (filters: GraphFilters) => void;
  resultCount: number;
}

export function SearchPanel({
  searchQuery,
  onSearchChange,
  filters,
  onFiltersChange,
  resultCount
}: SearchPanelProps) {
  const handleKindToggle = useCallback(
    (kind: TypeKind) => {
      const current = filters.kinds ?? [];
      const next = current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind];
      onFiltersChange({ ...filters, kinds: next.length > 0 ? next : undefined });
    },
    [filters, onFiltersChange]
  );

  const handleOrphansToggle = useCallback(() => {
    onFiltersChange({ ...filters, hideOrphans: !filters.hideOrphans });
  }, [filters, onFiltersChange]);

  return (
    <div className="rune-panel rune-search-panel">
      <div className="rune-panel-header">Search</div>
      <input
        type="text"
        className="rune-search-input"
        placeholder="Search types..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      {searchQuery && (
        <div className="rune-search-panel__results">
          {resultCount} result{resultCount !== 1 ? 's' : ''}
        </div>
      )}
      <div className="rune-search-panel__filter-section">
        <div className="rune-detail-label">Filter by Kind</div>
        <div className="rune-search-panel__filter-buttons">
          {(['data', 'choice', 'enum'] as TypeKind[]).map((kind) => (
            <button
              key={kind}
              className={`rune-toolbar-button${
                filters.kinds?.includes(kind) ? ' rune-toolbar-button-active' : ''
              }`}
              onClick={() => handleKindToggle(kind)}
            >
              {kind}
            </button>
          ))}
        </div>
      </div>
      <div className="rune-search-panel__orphan-toggle">
        <label className="rune-search-panel__orphan-label">
          <input
            type="checkbox"
            checked={filters.hideOrphans ?? false}
            onChange={handleOrphansToggle}
          />
          Hide orphan nodes
        </label>
      </div>
    </div>
  );
}
