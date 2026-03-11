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
import type { TypeNodeData } from '../../types.js';

export interface DetailPanelProps {
  nodeData: TypeNodeData | null;
}

export function DetailPanel({ nodeData }: DetailPanelProps) {
  if (!nodeData) return null;

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold truncate">{nodeData.name}</h3>
          <Badge variant={nodeData.kind as 'data' | 'enum' | 'choice' | 'func'}>
            {nodeData.kind}
          </Badge>
        </div>

        <Separator />

        {/* Namespace */}
        <DetailField label="Namespace" value={nodeData.namespace} />

        {/* Definition */}
        {nodeData.definition && <DetailField label="Definition" value={nodeData.definition} />}

        {/* Extends */}
        {nodeData.parentName && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Extends</span>
            <span className="inline-flex items-center gap-1.5 text-sm">
              <GitFork className="size-3.5 text-muted-foreground" />
              {nodeData.parentName}
            </span>
          </div>
        )}

        {/* Members */}
        {nodeData.members.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Members ({nodeData.members.length})
              </span>
              <div className="flex flex-col gap-1">
                {nodeData.members.map((member) => (
                  <div key={member.name} className="flex items-baseline gap-1 text-sm font-mono">
                    <span>{member.name}</span>
                    {member.typeName && (
                      <span className="text-muted-foreground">: {member.typeName}</span>
                    )}
                    {member.cardinality && (
                      <span className="text-xs text-muted-foreground">{member.cardinality}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Errors */}
        {nodeData.errors.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-destructive">
                Errors ({nodeData.errors.length})
              </span>
              {nodeData.errors.map((err, i) => (
                <div
                  key={i}
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
