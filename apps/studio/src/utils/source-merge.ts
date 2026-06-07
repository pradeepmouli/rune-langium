// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Source-merge — splice serialized edits into original source, preserving
 * untouched root elements verbatim.
 *
 * Background (2026-05-20, PR #221 Codex P1 follow-up): the visual editor's
 * source-sync pipeline runs the in-memory graph through
 * `serializeModel()`, which is intentionally lossy — it only emits
 * `Data`/`Choice`/`RosettaEnumeration` and silently drops every other
 * root element kind (RosettaFunction body, RosettaTypeAlias, RosettaRule,
 * RosettaReport, RosettaRecordType, RosettaBasicType, Annotation,
 * RosettaCorpus, RosettaSegment, …). Several of those kinds are not even
 * loaded into the graph in the first place, so extending the serializer
 * cannot recover them.
 *
 * The Codex P1 said: feeding the wholesale serializer output back into the
 * source pane is strictly worse than the original "edits don't propagate"
 * bug because every store change silently rewrites the file and erases
 * unsupported elements. Renaming one attribute on a `type Foo` shouldn't
 * delete the `func bar` and `typeAlias Baz` that lived next to it.
 *
 * This module performs a smart merge: for each root element in the
 * *original* source, if the serialized output also contains a same-named
 * element of the same kind, we splice the serialized text into the
 * element's CST source range; otherwise we keep the original text
 * verbatim. New elements added in the graph that have no original-source
 * counterpart get appended to the end.
 *
 * The merge resolution is **name + kind based** — renames within a single
 * mutation cycle are treated as "delete old, add new" which is the same
 * behaviour the user gets from a straight rename through the source
 * editor.
 */

import { parse } from '@rune-langium/core';

interface ElementRange {
  name: string;
  kind: string;
  offset: number;
  end: number;
  text: string;
}

interface CstLike {
  offset?: number;
  end?: number;
  text?: string;
}

const ROOT_ELEMENT_KINDS = new Set([
  'Data',
  'Choice',
  'RosettaEnumeration',
  'RosettaFunction',
  'RosettaTypeAlias',
  'RosettaRecordType',
  'RosettaBasicType',
  'Annotation',
  'RosettaRule',
  'RosettaReport',
  'RosettaCorpus',
  'RosettaSegment',
  'RosettaBody',
  'RosettaSynonymSource',
  'RosettaMetaType',
  'RosettaExternalRuleSource',
  'RosettaExternalFunction'
]);

/**
 * Extract `(name, kind, [offset,end])` ranges for every root element in a
 * parsed `.rosetta` source string. Returns `null` if `parse()` fails or the
 * CST isn't available — the caller should fall back to the input text
 * unchanged in that case.
 */
async function extractElementRanges(source: string): Promise<ElementRange[] | null> {
  if (!source.trim()) return [];
  try {
    const result = await parse(source);
    const model = result.value as unknown as { elements?: unknown[] };
    const elements = model.elements ?? [];
    const out: ElementRange[] = [];
    for (const el of elements) {
      const e = el as { $type?: string; name?: string; $cstNode?: CstLike };
      if (!e.$type || !e.name) continue;
      if (!ROOT_ELEMENT_KINDS.has(e.$type)) continue;
      const cst = e.$cstNode;
      if (!cst || typeof cst.offset !== 'number' || typeof cst.end !== 'number') {
        // Without CST coordinates we cannot splice safely. Bail.
        return null;
      }
      out.push({
        name: e.name,
        kind: e.$type,
        offset: cst.offset,
        end: cst.end,
        text: typeof cst.text === 'string' ? cst.text : source.slice(cst.offset, cst.end)
      });
    }
    // Sort by source offset so we can walk the file front-to-back.
    out.sort((a, b) => a.offset - b.offset);
    return out;
  } catch {
    return null;
  }
}

/**
 * Build a key for matching elements across original/serialized passes.
 * Same-named elements of different kinds (`type Foo` vs `func Foo`) are
 * distinct.
 */
function elementKey(name: string, kind: string): string {
  // Internal composite Map key for matching elements across the original /
  // serialized passes — NOT a node id. A NUL separator (unrepresentable in
  // identifiers) keeps it unambiguous and out of the retired `::` node-id shape.
  return `${kind}\x00${name}`;
}

/**
 * Merge serialized output into the original source, preserving any root
 * elements the serializer dropped.
 *
 * @param originalSource - The file content as it sits on disk before this
 *   edit cycle. If the file is empty or unparseable, this is returned
 *   unchanged when `serialized` is also empty / unparseable; otherwise the
 *   serialized text wins (no baseline to merge against).
 * @param serializedSource - The lossy text emitted by `serializeModel()`
 *   for the same namespace.
 * @returns Merged `.rosetta` source text.
 */
export async function mergeSerializedIntoSource(
  originalSource: string,
  serializedSource: string
): Promise<string> {
  const originalRanges = await extractElementRanges(originalSource);
  const serializedRanges = await extractElementRanges(serializedSource);

  // If we couldn't parse the serialized output, fall back to the original
  // verbatim — better stale than destroyed.
  if (serializedRanges === null) return originalSource;

  // If the original is unparseable, we can't safely splice — emit the
  // serialized text (this matches old behaviour).
  if (originalRanges === null) return serializedSource;

  const serializedByKey = new Map<string, ElementRange>();
  for (const r of serializedRanges) {
    serializedByKey.set(elementKey(r.name, r.kind), r);
  }

  const originalKeys = new Set<string>();
  for (const r of originalRanges) {
    originalKeys.add(elementKey(r.name, r.kind));
  }

  // Build the merged text by walking original ranges in order and
  // splicing in serialized text for elements the serializer rewrote.
  let cursor = 0;
  const parts: string[] = [];
  for (const range of originalRanges) {
    // Emit the verbatim chunk between elements (whitespace, comments,
    // unknown tokens, etc.).
    if (range.offset > cursor) {
      parts.push(originalSource.slice(cursor, range.offset));
    }

    const key = elementKey(range.name, range.kind);
    const serial = serializedByKey.get(key);
    if (serial) {
      // Element exists in both — splice the serialized text.
      parts.push(serial.text);
      serializedByKey.delete(key); // mark as consumed
    } else {
      // Element was dropped by the serializer (unsupported kind) OR was
      // deleted from the graph. We can't tell from here; preserve the
      // original. This is the conservative choice — a stale element is
      // strictly safer than silent data loss. Users who genuinely
      // deleted a type can do so through the source editor.
      parts.push(range.text);
    }

    cursor = range.end;
  }
  // Trailing content (comments after last element, final newline).
  if (cursor < originalSource.length) {
    parts.push(originalSource.slice(cursor));
  }

  // Anything left in serializedByKey is a *new* element added in the
  // graph (no original counterpart). Append it with reasonable spacing.
  if (serializedByKey.size > 0) {
    const merged = parts.join('');
    const needsTrailingNl = !merged.endsWith('\n');
    const additions: string[] = [];
    for (const r of serializedByKey.values()) {
      additions.push(r.text);
    }
    return merged + (needsTrailingNl ? '\n' : '') + '\n' + additions.join('\n\n') + '\n';
  }

  return parts.join('');
}
