// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Cheap reader for a serialized Langium RosettaModel's namespace + import
 * declarations — JSON only, NO Langium deserialize/link. Used to compute the
 * curated dependency closure without paying the link cost.
 *
 * Serialized shape (packages/core/src/serializer/rosetta-serializer.ts):
 *   { $type:'RosettaModel', name: string | { segments: string[] },
 *     imports?: Array<{ importedNamespace?: string }> }
 * `importedNamespace` is a QualifiedNameWithWildcard, e.g. `cdm.base.datetime`
 * or `cdm.base.*`.
 */
export interface SerializedModelMeta {
  namespace: string;
  imports: string[];
}

function nameToNamespace(name: unknown): string | undefined {
  if (typeof name === 'string') return name.replace(/^"|"$/g, '');
  if (name && typeof name === 'object' && 'segments' in (name as object)) {
    const segs = (name as { segments?: unknown }).segments;
    if (Array.isArray(segs)) return segs.join('.');
  }
  return undefined;
}

export function readSerializedModelMeta(serializedModel: string): SerializedModelMeta | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedModel);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const m = parsed as { name?: unknown; imports?: unknown };
  const namespace = nameToNamespace(m.name);
  if (!namespace) return null;
  const imports: string[] = [];
  if (Array.isArray(m.imports)) {
    for (const imp of m.imports) {
      const ns = (imp as { importedNamespace?: unknown })?.importedNamespace;
      if (typeof ns === 'string' && ns.length > 0) imports.push(ns);
    }
  }
  return { namespace, imports };
}
