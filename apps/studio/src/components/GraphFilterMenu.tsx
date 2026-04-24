// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * GraphFilterMenu — Popover menu for toggling graph node/edge visibility by kind.
 *
 * Shows checkboxes for each node type (Data, Choice, Enum, etc.) and
 * edge type (Inheritance, References, etc.) with color-coded indicators.
 */

import { useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@rune-langium/design-system/ui/popover';
import { Button } from '@rune-langium/design-system/ui/button';
import { Separator } from '@rune-langium/design-system/ui/separator';
import { Filter, GitBranch, ArrowRight, List, Hash, Braces, Tag, FileText } from 'lucide-react';
import { useEditorStore } from '@rune-langium/visual-editor';
import type { TypeKind, EdgeKind } from '@rune-langium/visual-editor';

/** Node kind display config. */
const NODE_KINDS: Array<{ kind: TypeKind; label: string; color: string; icon: typeof GitBranch }> =
  [
    { kind: 'data', label: 'Data', color: '#00D4AA', icon: Braces },
    { kind: 'choice', label: 'Choice', color: '#E8913A', icon: List },
    { kind: 'enum', label: 'Enum', color: '#8B7BF4', icon: Hash },
    { kind: 'func', label: 'Function', color: '#82AAFF', icon: ArrowRight },
    { kind: 'record', label: 'Record', color: '#82AAFF', icon: FileText },
    { kind: 'typeAlias', label: 'Type Alias', color: '#8A8A96', icon: Tag },
    { kind: 'basicType', label: 'Basic Type', color: '#8A8A96', icon: Tag },
    { kind: 'annotation', label: 'Annotation', color: '#8A8A96', icon: Tag }
  ];

/** Edge kind display config. */
const EDGE_KINDS: Array<{ kind: EdgeKind; label: string; color: string; dashed?: boolean }> = [
  { kind: 'extends', label: 'Inheritance', color: '#00D4AA' },
  { kind: 'enum-extends', label: 'Enum Inheritance', color: '#8B7BF4' },
  { kind: 'attribute-ref', label: 'References', color: '#82AAFF', dashed: true },
  { kind: 'choice-option', label: 'Choice Options', color: '#E8913A' },
  { kind: 'type-alias-ref', label: 'Type Alias Refs', color: '#8A8A96', dashed: true }
];

export function GraphFilterMenu() {
  const visibility = useEditorStore((s) => s.visibility);
  const toggleNodeKind = useEditorStore((s) => s.toggleNodeKind);
  const toggleEdgeKind = useEditorStore((s) => s.toggleEdgeKind);
  const showAllNodeKinds = useEditorStore((s) => s.showAllNodeKinds);
  const showAllEdgeKinds = useEditorStore((s) => s.showAllEdgeKinds);

  const { visibleNodeKinds, visibleEdgeKinds } = visibility;

  const allNodesVisible = visibleNodeKinds.size === NODE_KINDS.length;
  const allEdgesVisible = visibleEdgeKinds.size === EDGE_KINDS.length;

  const handleResetAll = useCallback(() => {
    showAllNodeKinds();
    showAllEdgeKinds();
  }, [showAllNodeKinds, showAllEdgeKinds]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={allNodesVisible && allEdgesVisible ? 'secondary' : 'default'}
          size="sm"
          title="Filter visible types and relationships"
        >
          <Filter className="w-3.5 h-3.5 mr-1" />
          Filter
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start" sideOffset={4}>
        <div className="p-3">
          {/* Node kinds section */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Node Types
            </span>
            {!allNodesVisible && (
              <button
                className="text-xs text-primary hover:text-primary/80"
                onClick={showAllNodeKinds}
              >
                Show all
              </button>
            )}
          </div>
          <div className="space-y-0.5">
            {NODE_KINDS.map(({ kind, label, color, icon: Icon }) => {
              const active = visibleNodeKinds.has(kind);
              return (
                <button
                  key={kind}
                  className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm transition-colors ${
                    active
                      ? 'text-foreground hover:bg-accent'
                      : 'text-muted-foreground/50 hover:bg-accent/50 line-through'
                  }`}
                  onClick={() => toggleNodeKind(kind)}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{
                      backgroundColor: active ? color : 'transparent',
                      border: `1.5px solid ${active ? color : 'currentColor'}`
                    }}
                  />
                  <Icon
                    className="w-3.5 h-3.5 flex-shrink-0"
                    style={{ opacity: active ? 1 : 0.4 }}
                  />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          <Separator className="my-2" />

          {/* Edge kinds section */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Relationships
            </span>
            {!allEdgesVisible && (
              <button
                className="text-xs text-primary hover:text-primary/80"
                onClick={showAllEdgeKinds}
              >
                Show all
              </button>
            )}
          </div>
          <div className="space-y-0.5">
            {EDGE_KINDS.map(({ kind, label, color, dashed }) => {
              const active = visibleEdgeKinds.has(kind);
              return (
                <button
                  key={kind}
                  className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm transition-colors ${
                    active
                      ? 'text-foreground hover:bg-accent'
                      : 'text-muted-foreground/50 hover:bg-accent/50 line-through'
                  }`}
                  onClick={() => toggleEdgeKind(kind)}
                >
                  <span className="w-4 flex-shrink-0 flex items-center">
                    <span
                      className="w-full h-0"
                      style={{
                        borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${active ? color : 'currentColor'}`,
                        opacity: active ? 1 : 0.4
                      }}
                    />
                  </span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          <Separator className="my-2" />

          {/* Reset button */}
          <button
            className="w-full px-2 py-1.5 rounded text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors text-center"
            onClick={handleResetAll}
          >
            Reset all filters
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
