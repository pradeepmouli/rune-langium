/**
 * SearchPanel — Search and filter UI panel.
 *
 * Provides a search input and filter controls for the graph
 * using shadcn/ui primitives and lucide-react icons.
 */

import { useCallback } from 'react';
import { Search, Filter, EyeOff } from 'lucide-react';
import { Input } from '@rune-langium/design-system/ui/input';
import { Button } from '@rune-langium/design-system/ui/button';
import { Badge } from '@rune-langium/design-system/ui/badge';
import { Separator } from '@rune-langium/design-system/ui/separator';
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
    <div className="flex flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Search className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Search</span>
      </div>

      {/* Search input */}
      <div className="relative">
        <Input
          type="text"
          placeholder="Search types..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {searchQuery && (
        <p className="text-xs text-muted-foreground">
          {resultCount} result{resultCount !== 1 ? 's' : ''}
        </p>
      )}

      <Separator />

      {/* Filter by kind */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <Filter className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Filter by Kind</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['data', 'choice', 'enum', 'func'] as TypeKind[]).map((kind) => {
            const isActive = filters.kinds?.includes(kind);
            return (
              <Button
                key={kind}
                variant={isActive ? 'default' : 'outline'}
                size="xs"
                onClick={() => handleKindToggle(kind)}
                className="capitalize"
              >
                {kind}
              </Button>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Orphan toggle */}
      <Button
        variant={filters.hideOrphans ? 'default' : 'outline'}
        size="sm"
        onClick={handleOrphansToggle}
        className="w-full justify-start gap-2"
      >
        <EyeOff className="size-3.5" />
        Hide orphan nodes
        {filters.hideOrphans && (
          <Badge variant="secondary" className="ml-auto">
            On
          </Badge>
        )}
      </Button>
    </div>
  );
}
