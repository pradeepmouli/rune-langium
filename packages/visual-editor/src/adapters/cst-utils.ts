// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * CST text extraction utilities.
 *
 * Langium CstNode getters (text, offset, end) are lost during structured clone
 * (postMessage). These helpers reconstruct text from the available data.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Compute offset/end from a deserialized CompositeCstNode by walking its content array. */
export function computeCstOffsets(cst: any): { offset: number; end: number } | undefined {
  const content = cst['content'] as any[] | undefined;
  if (!content || content.length === 0) return undefined;
  let minOffset = Infinity;
  let maxEnd = 0;
  for (const child of content) {
    const off = child['_offset'] as number | undefined;
    const len = child['_length'] as number | undefined;
    if (typeof off === 'number' && typeof len === 'number') {
      minOffset = Math.min(minOffset, off);
      maxEnd = Math.max(maxEnd, off + len);
    } else if (child['content']) {
      const nested = computeCstOffsets(child);
      if (nested) {
        minOffset = Math.min(minOffset, nested.offset);
        maxEnd = Math.max(maxEnd, nested.end);
      }
    }
  }
  return minOffset < Infinity ? { offset: minOffset, end: maxEnd } : undefined;
}

/**
 * Get the source text for an AST node.
 * Tries CST `.text` getter first, then reconstructs from root._text,
 * then falls back to `$cstText` preserved by the parser worker.
 */
export function getCstText(node: { $cstNode?: any }): string | undefined {
  const cst = node.$cstNode;
  if (!cst) return (node as unknown as Record<string, string>)['$cstText'];
  if (typeof cst.text === 'string') return cst.text;
  const root = cst.root;
  const fullText = root?.['_text'] as string | undefined;
  if (fullText && cst['content']) {
    const offsets = computeCstOffsets(cst);
    if (offsets) return fullText.substring(offsets.offset, offsets.end);
  }
  return (node as unknown as Record<string, string>)['$cstText'];
}
