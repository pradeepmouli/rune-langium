// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Text+CST-level merge for ImportDialog's "merge into an open file" path
 * (spec 021 Phase 4 consumer — see
 * docs/superpowers/specs/2026-07-06-explorer-import-dialog-design.md).
 * Operates only on top-level elements (types/enums/choices/functions);
 * never rewrites an existing declaration's body. A name collision always
 * means "keep what's already there, skip the incoming one."
 */

import { parse } from '@rune-langium/core';

export interface MergeResult {
  mergedText: string;
  /** Element names dropped due to a name collision with the target file. */
  skipped: string[];
}

/**
 * Merges `importedText`'s top-level elements into `existingText`, dropping
 * any element whose name already exists in `existingText`. Throws if either
 * input, or the merged result, fails to parse — that is this function's own
 * invariant (importModel() already guarantees importedText parses cleanly;
 * a failure here means a bug in this splice logic, not a user input error).
 */
export async function mergeImportedText(existingText: string, importedText: string): Promise<MergeResult> {
  const [existingParse, importedParse] = await Promise.all([parse(existingText), parse(importedText)]);
  if (existingParse.hasErrors) {
    throw new Error('mergeImportedText: existingText failed to parse.');
  }
  if (importedParse.hasErrors) {
    throw new Error('mergeImportedText: importedText failed to parse.');
  }

  const existingNames = new Set(
    existingParse.value.elements.map((el) => (el as { name?: string }).name).filter((n): n is string => n !== undefined)
  );

  const skipped: string[] = [];
  const spans: string[] = [];
  for (const el of importedParse.value.elements) {
    const name = (el as { name?: string }).name;
    if (name !== undefined && existingNames.has(name)) {
      skipped.push(name);
      continue;
    }
    const cst = el.$cstNode;
    if (!cst) continue;
    spans.push(importedText.slice(cst.offset, cst.offset + cst.length));
  }

  const mergedText = spans.length === 0 ? existingText : `${existingText}\n\n${spans.join('\n\n')}`;

  const mergedParse = await parse(mergedText);
  if (mergedParse.hasErrors) {
    throw new Error('mergeImportedText: merged output failed to re-parse.');
  }

  return { mergedText, skipped };
}
