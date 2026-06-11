// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * OtherForm — Read-only fallback form for type kinds that do not yet have a
 * dedicated editor form (record, basicType, annotation) as well as the
 * default renderer used when a node is read-only (e.g. curated reference-only
 * entries).
 *
 * Shows detailed information about the currently selected type node
 * using shadcn/ui primitives and lucide-react icons.
 */

import { AlertCircle } from 'lucide-react';
import { Badge } from '@rune-langium/design-system/ui/badge';
import { Separator } from '@rune-langium/design-system/ui/separator';
import { ScrollArea } from '@rune-langium/design-system/ui/scroll-area';
import { resolveNodeKind, formatCardinality, getTypeRefText, getRefText } from '../../adapters/model-helpers.js';
import { TypeLink } from '../editors/TypeLink.js';
import { TypeHeader } from '../TypeHeader.js';
import { DefinitionField } from '../DefinitionField.js';
import { ExtendsField } from '../ExtendsField.js';
import type { AnyGraphNode, GraphNodeMeta, ValidationError, NavigateToNodeCallback, TypeKind } from '../../types.js';
import { metaFromFlatData } from '../../store/node-projection.js';

export interface OtherFormProps {
  nodeData: AnyGraphNode | null;
  /**
   * UI/editor metadata for the node (namespace, errors, ...). Optional during
   * Phase 3 step 2: when absent it is derived from the flat metadata copies
   * still merged into `nodeData` (dual-presence window). Required in step 3.
   */
  meta?: GraphNodeMeta;
  /** Graph node id of the displayed type — enables the header "Reveal in graph" action. */
  nodeId?: string | null;
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

export function OtherForm({ nodeData, meta: metaProp, nodeId, onNavigateToNode, allNodeIds, refOnly }: OtherFormProps) {
  if (!nodeData) return null;

  const d = nodeData as any;
  const nodeMeta = metaProp ?? metaFromFlatData(d);
  const kind = resolveNodeKind(d);
  // Parent-name: read the inheritance ref directly off the AST node. The
  // generated `toDomain(d).extends` normalization is intentionally NOT used
  // here. OtherForm renders curated `refOnly` entries whose `$type` values
  // fall outside the editable union; `toDomain` throws `Unknown node type: …`
  // on an unrecognized `$type`, which the FormErrorBoundary would surface as
  // "Failed to render editor form" — exactly on the nodes this form exists
  // to render. The direct chain returns `undefined` gracefully and is O(1)
  // (no deep projection of the whole node for a single optional scalar). The
  // `extends`-normalization dogfooding belongs on bulk surfaces, not this
  // per-render single-field read.
  const parentName = getRefText(d.superType) ?? getRefText(d.parent) ?? getRefText(d.superFunction);
  const members = extractMembers(d);
  const errors: ValidationError[] = nodeMeta.errors;

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-4">
        {/* Header: Namespace + Name + Badge */}
        <TypeHeader
          kind={kind as TypeKind}
          namespace={nodeMeta.namespace}
          name={d.name}
          className="-mx-4 -mt-4"
          onReveal={onNavigateToNode && nodeId ? () => onNavigateToNode(nodeId) : undefined}
          trailing={
            refOnly ? (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                Reference Only
              </Badge>
            ) : undefined
          }
        />

        <Separator />

        {/* Definition */}
        {d.definition && <DefinitionField value={d.definition} />}

        {/* Extends */}
        {parentName && (
          <ExtendsField parentName={parentName} onNavigateToNode={onNavigateToNode} allNodeIds={allNodeIds} />
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
