// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import type { TypeGraphEdge, DomainNodeData } from '../types.js';

/**
 * Form-preserving `$refText` rewrite (moved verbatim from editor-store's
 * renameRefText). Matches the two forms the codebase emits: bare (`oldName`)
 * and namespace-qualified (`<namespace>.<oldName>`, the form
 * `disambiguateTypeRef` writes). Returns the rewritten value or null when
 * `value` does not reference the renamed type.
 */
export function renameRefValue(
  value: string | undefined,
  oldName: string,
  newName: string,
  namespace: string
): string | null {
  if (value === oldName) return newName;
  if (value === `${namespace}.${oldName}`) return `${namespace}.${newName}`;
  return null;
}

type MemberWithTypeCall = { name?: string; typeCall?: { type?: { $refText?: string } } };

/** Rewrite `members[i].typeCall.type.$refText` for the member named `label`. */
function rewriteMemberByName(
  members: readonly MemberWithTypeCall[] | undefined,
  label: string | undefined,
  oldName: string,
  newName: string,
  namespace: string
): { members: MemberWithTypeCall[]; changed: boolean } | null {
  if (!members || label === undefined) return null;
  const i = members.findIndex((m) => m.name === label);
  if (i === -1) return null;
  const next = renameRefValue(members[i]?.typeCall?.type?.$refText, oldName, newName, namespace);
  if (next === null) return null;
  const updated = [...members];
  updated[i] = {
    ...updated[i],
    typeCall: { ...updated[i]!.typeCall, type: { ...updated[i]!.typeCall!.type, $refText: next } }
  };
  return { members: updated, changed: true };
}

/**
 * Locate the ref slot named by `edge` inside `sourceData` and rewrite it
 * form-preservingly (spec §1: location = edge kind + label + node $type,
 * name-addressed). Returns the new data object, or null when the slot
 * cannot be located or its `$refText` matches neither expected form —
 * an INVARIANT BREACH the caller must dev-warn + skip (never guess,
 * never fall back to name matching).
 */
export function rewriteEdgeRefInNode(
  edge: TypeGraphEdge,
  sourceData: DomainNodeData,
  oldName: string,
  newName: string,
  namespace: string
): DomainNodeData | null {
  const d = sourceData as unknown as Record<string, unknown>;
  const kind = edge.data?.kind;
  const label = edge.data?.label as string | undefined;

  switch (kind) {
    case 'attribute-ref': {
      // Member-name label. Which array depends on the node kind; func 'output'
      // is a labeled singleton (ast-to-model.ts:274).
      if (sourceData.$type === 'RosettaFunction') {
        if (label === 'output') {
          const out = d['output'] as MemberWithTypeCall | undefined;
          const next = renameRefValue(out?.typeCall?.type?.$refText, oldName, newName, namespace);
          if (next === null) return null;
          return {
            ...sourceData,
            output: { ...out, typeCall: { ...out!.typeCall, type: { ...out!.typeCall!.type, $refText: next } } }
          } as DomainNodeData;
        }
        const r = rewriteMemberByName(d['inputs'] as MemberWithTypeCall[], label, oldName, newName, namespace);
        return r ? ({ ...sourceData, inputs: r.members } as DomainNodeData) : null;
      }
      if (sourceData.$type === 'RosettaRecordType') {
        const r = rewriteMemberByName(d['features'] as MemberWithTypeCall[], label, oldName, newName, namespace);
        return r ? ({ ...sourceData, features: r.members } as DomainNodeData) : null;
      }
      // Data + Annotation: attributes
      const r = rewriteMemberByName(d['attributes'] as MemberWithTypeCall[], label, oldName, newName, namespace);
      return r ? ({ ...sourceData, attributes: r.members } as DomainNodeData) : null;
    }
    case 'choice-option': {
      // Label carries the (possibly qualified) TYPE name, not a member name
      // (ast-to-model.ts:242, editor-store renameType step-3 comment).
      const options = d['attributes'] as MemberWithTypeCall[] | undefined;
      if (!options) return null;
      // Rewrite ALL matching options, not just the first: duplicate options
      // for the same type share ONE edge (identical source/target/label), so
      // the cascade sees this arm exactly once — and the store explicitly
      // tolerates duplicates (removeChoiceOption drains them in a loop). A
      // first-match rewrite would leave sibling duplicates stale at serialize.
      let matched = false;
      const updated = options.map((o) => {
        const next = renameRefValue(o.typeCall?.type?.$refText, oldName, newName, namespace);
        if (next === null) return o;
        matched = true;
        return { ...o, typeCall: { ...o.typeCall, type: { ...o.typeCall!.type, $refText: next } } };
      });
      if (!matched) return null;
      return { ...sourceData, attributes: updated } as DomainNodeData;
    }
    case 'extends': {
      const field = sourceData.$type === 'RosettaFunction' ? 'superFunction' : 'superType';
      const ref = d[field] as { $refText?: string } | undefined;
      const next = renameRefValue(ref?.$refText, oldName, newName, namespace);
      if (next === null) return null;
      return { ...sourceData, [field]: { ...ref, $refText: next } } as DomainNodeData;
    }
    case 'enum-extends': {
      const ref = d['parent'] as { $refText?: string } | undefined;
      const next = renameRefValue(ref?.$refText, oldName, newName, namespace);
      if (next === null) return null;
      return { ...sourceData, parent: { ...ref, $refText: next } } as DomainNodeData;
    }
    case 'type-alias-ref': {
      const typeCall = d['typeCall'] as { type?: { $refText?: string } } | undefined;
      const next = renameRefValue(typeCall?.type?.$refText, oldName, newName, namespace);
      if (next === null) return null;
      return {
        ...sourceData,
        typeCall: { ...typeCall, type: { ...typeCall!.type, $refText: next } }
      } as DomainNodeData;
    }
    default:
      return null;
  }
}

/**
 * Rewrite `typeCall.type.$refText` references in a node's member arrays.
 * Returns the same object if nothing changed, or a new object with updates.
 *
 * SURVIVES ONLY for the renamed node's OWN data (spec §3.4/§5): self-refs
 * have no edges (no self-edges in `edgesById` — it feeds React Flow), so a
 * bare self-name inside the node binds to itself and name-matching scoped
 * to this single node is sound. `renameType` applies this ONLY to the
 * renamed node's own data, never to other nodes (those go through
 * `rewriteEdgeRefInNode`, edge-driven).
 *
 * `namespace` is the renamed type's namespace, used to also match qualified
 * (`<namespace>.<oldName>`) references — not just the bare name.
 */
export function rewriteOwnRefs(d: DomainNodeData, oldName: string, newName: string, namespace: string): DomainNodeData {
  let changed = false;

  function updateMemberRefs<T extends { typeCall?: { type?: { $refText?: string } } }>(members: T[]): T[] {
    const updated = members.map((m) => {
      const next = renameRefValue(m.typeCall?.type?.$refText, oldName, newName, namespace);
      if (next !== null) {
        changed = true;
        return {
          ...m,
          typeCall: {
            ...m.typeCall,
            type: { ...m.typeCall!.type, $refText: next }
          }
        } as T;
      }
      return m;
    });
    return updated;
  }

  function updateRefText(ref: { $refText?: string } | undefined): { $refText?: string } | undefined {
    const next = renameRefValue(ref?.$refText, oldName, newName, namespace);
    if (next !== null) {
      changed = true;
      return { ...ref, $refText: next };
    }
    return ref;
  }

  const result = { ...d } as Record<string, unknown>;

  // `d.$type` is the DomainNodeData discriminant — each case narrows `d`.
  switch (d.$type) {
    case 'Data': {
      result.attributes = updateMemberRefs(d.attributes as any[]);
      result.superType = updateRefText(d.superType);
      break;
    }
    case 'Choice': {
      result.attributes = updateMemberRefs(d.attributes as any[]);
      break;
    }
    case 'RosettaFunction': {
      result.inputs = updateMemberRefs(d.inputs as any[]);
      const outNext = renameRefValue((d.output as any)?.typeCall?.type?.$refText, oldName, newName, namespace);
      if (outNext !== null) {
        changed = true;
        const out = d.output as any;
        result.output = {
          ...out,
          typeCall: { ...out.typeCall, type: { ...out.typeCall.type, $refText: outNext } }
        };
      }
      result.superFunction = updateRefText(d.superFunction);
      break;
    }
    case 'RosettaRecordType': {
      result.features = updateMemberRefs(d.features as any[]);
      break;
    }
    case 'RosettaEnumeration': {
      result.parent = updateRefText(d.parent);
      break;
    }
    case 'Annotation': {
      result.attributes = updateMemberRefs(d.attributes as any[]);
      break;
    }
  }

  return changed ? (result as unknown as DomainNodeData) : d;
}
