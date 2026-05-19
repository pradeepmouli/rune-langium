// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * DetailPanel — Type detail sidebar panel.
 *
 * Shows detailed information about the currently selected type node
 * using shadcn/ui primitives and lucide-react icons.
 */

import { AlertCircle, GitFork } from 'lucide-react';
import { Badge } from '@rune-langium/design-system/ui/badge';
import { Separator } from '@rune-langium/design-system/ui/separator';
import { ScrollArea } from '@rune-langium/design-system/ui/scroll-area';
import { resolveNodeKind, formatCardinality, getTypeRefText, getRefText } from '../../adapters/model-helpers.js';
import { TypeLink } from '../editors/TypeLink.js';
import type { AnyGraphNode, ValidationError, NavigateToNodeCallback } from '../../types.js';

export interface DetailPanelProps {
  nodeData: AnyGraphNode | null;
  /** Callback to navigate to a type's graph node. */
  onNavigateToNode?: NavigateToNodeCallback;
  /** All loaded graph node IDs for resolving type name to node ID. */
  allNodeIds?: string[];
  /**
   * True when the node's source file is a curated reference-only entry
   * (no client-side source text). Renders a "Reference Only" pill next
   * to the kind badge so users understand why the panel is non-editable.
   */
  refOnly?: boolean;
}

/** Extract a flat list of {name, typeName, cardinality} from any node type. */
function extractMembers(d: any): Array<{ name: string; typeName?: string; cardinality?: string }> {
  const kind = resolveNodeKind(d);
  switch (kind) {
    case 'data':
    case 'annotation':
      return (d.attributes ?? []).map((a: any) => ({
        name: a.name ?? '',
        typeName: getTypeRefText(a.typeCall),
        cardinality: formatCardinality(a.card)
      }));
    case 'enum':
      return (d.enumValues ?? []).map((v: any) => ({
        name: v.name ?? '',
        typeName: undefined,
        cardinality: undefined
      }));
    case 'choice':
      return (d.attributes ?? []).map((o: any) => ({
        name: getTypeRefText(o.typeCall) ?? '',
        typeName: getTypeRefText(o.typeCall),
        cardinality: undefined
      }));
    case 'func':
      return (d.inputs ?? []).map((p: any) => ({
        name: p.name ?? '',
        typeName: getTypeRefText(p.typeCall),
        cardinality: formatCardinality(p.card)
      }));
    case 'record':
      return (d.features ?? []).map((f: any) => ({
        name: f.name ?? '',
        typeName: getTypeRefText(f.typeCall),
        cardinality: formatCardinality(f.card)
      }));
    default:
      return [];
  }
}

export function DetailPanel({ nodeData, onNavigateToNode, allNodeIds, refOnly }: DetailPanelProps) {
  if (!nodeData) return null;

  const d = nodeData as any;
  const kind = resolveNodeKind(d);
  const parentName = getRefText(d.superType) ?? getRefText(d.parent) ?? getRefText(d.superFunction);
  const members = extractMembers(d);
  const errors: ValidationError[] = d.errors ?? [];

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold truncate">{d.name}</h3>
          <Badge variant={kind as 'data' | 'enum' | 'choice' | 'func'}>{kind}</Badge>
          {refOnly && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Reference Only
            </Badge>
          )}
        </div>

        <Separator />

        {/* Namespace */}
        <DetailField label="Namespace" value={d.namespace ?? ''} />

        {/* Definition */}
        {d.definition && <DetailField label="Definition" value={d.definition} />}

        {/* Extends */}
        {parentName && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Extends</span>
            <span className="inline-flex items-center gap-1.5 text-sm">
              <GitFork className="size-3.5 text-muted-foreground" />
              <TypeLink
                typeName={parentName}
                onNavigateToNode={onNavigateToNode}
                allNodeIds={allNodeIds}
                className="text-sm"
              />
            </span>
          </div>
        )}

        {/* Members */}
        {members.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Members ({members.length})</span>
              <div className="flex flex-col gap-1">
                {members.map((member) => (
                  <div key={member.name} className="flex items-baseline gap-1 text-sm font-mono">
                    <span>{member.name}</span>
                    {member.typeName && (
                      <span className="text-muted-foreground">
                        :{' '}
                        <TypeLink
                          typeName={member.typeName}
                          onNavigateToNode={onNavigateToNode}
                          allNodeIds={allNodeIds}
                          className="text-muted-foreground"
                        />
                      </span>
                    )}
                    {member.cardinality && <span className="text-xs text-muted-foreground">{member.cardinality}</span>}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Errors */}
        {errors.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-destructive">Errors ({errors.length})</span>
              {errors.map((err, i) => (
                <div
                  key={`${err.ruleId ?? 'err'}:${err.message}:${i}`}
                  className="flex items-start gap-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive"
                >
                  <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                  <span>{err.message}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
