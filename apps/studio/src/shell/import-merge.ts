// apps/studio/src/shell/import-merge.ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Text+CST-level merge for ImportDialog's "merge into an open file" path
 * (spec 021 Phase 4 consumer — see
 * docs/superpowers/specs/2026-07-06-explorer-import-dialog-design.md and
 * docs/superpowers/specs/2026-07-10-import-options-schema-design.md).
 * Operates only on top-level elements (types/enums/choices/functions);
 * never rewrites an existing declaration's body. `onCollision` (default
 * 'skip') controls how a name collision is resolved:
 *   - skip: keep what's already there, drop the incoming one (original,
 *     only-ever behavior before this option existed).
 *   - overwrite: drop the EXISTING element's span, splice the incoming
 *     element's span in its place (same position in the target file).
 *   - rename: keep both — the incoming element's own name token is
 *     rewritten (a numeric suffix, same convention as `uniqueFilePath`)
 *     before its span is appended. This never touches the existing
 *     declaration or either declaration's body — only the incoming
 *     declaration's own leading name token.
 */

import { parse } from '@rune-langium/core';
import type { MergeOptions } from './import-merge-options.js';

export interface MergeResult {
  mergedText: string;
  /** Element names dropped due to a name collision with the target file (onCollision: 'skip'). */
  skipped: string[];
  /** Element names whose EXISTING declaration was replaced by the incoming one (onCollision: 'overwrite'). */
  overwritten: string[];
  /** Incoming elements renamed to avoid a collision (onCollision: 'rename'). */
  renamed: { from: string; to: string }[];
}

const DECL_NAME_RE = /^(type|enum|choice|func)\s+(\w+)/;

function renameDeclaration(spanText: string, newName: string): string {
  const match = DECL_NAME_RE.exec(spanText);
  if (!match) {
    throw new Error(`mergeImportedText: could not locate a declaration name to rename in: ${spanText.slice(0, 40)}...`);
  }
  return spanText.slice(0, match[1]!.length) + spanText.slice(match[1]!.length).replace(match[2]!, newName);
}

function uniqueDeclarationName(candidate: string, taken: ReadonlySet<string>): string {
  if (!taken.has(candidate)) return candidate;
  let n = 2;
  let next = `${candidate}_${n}`;
  while (taken.has(next)) {
    n += 1;
    next = `${candidate}_${n}`;
  }
  return next;
}

/**
 * Merges `importedText`'s top-level elements into `existingText`. Throws if
 * either input, or the merged result, fails to parse — that is this
 * function's own invariant (importModel() already guarantees importedText
 * parses cleanly; a failure here means a bug in this splice logic, not a
 * user input error).
 */
export async function mergeImportedText(
  existingText: string,
  importedText: string,
  options: MergeOptions = { onCollision: 'skip' }
): Promise<MergeResult> {
  const [existingParse, importedParse] = await Promise.all([
    parse(existingText, 'inmemory:///existing.rosetta'),
    parse(importedText, 'inmemory:///imported.rosetta')
  ]);
  if (existingParse.hasErrors) {
    throw new Error('mergeImportedText: existingText failed to parse.');
  }
  if (importedParse.hasErrors) {
    throw new Error('mergeImportedText: importedText failed to parse.');
  }

  const existingElements = existingParse.value.elements as ReadonlyArray<{
    name?: string;
    $cstNode?: { offset: number; length: number };
  }>;
  const existingByName = new Map(
    existingElements
      .filter((el): el is typeof el & { name: string } => el.name !== undefined)
      .map((el) => [el.name, el])
  );
  const allNames = new Set(existingByName.keys());

  const skipped: string[] = [];
  const overwritten: string[] = [];
  const renamed: { from: string; to: string }[] = [];
  const appendSpans: string[] = [];
  // Existing-text edits (overwrite only) are collected as [start, end, replacement]
  // and applied in one pass, offset-safe by processing in descending start order.
  const existingEdits: { start: number; end: number; replacement: string }[] = [];

  for (const el of importedParse.value.elements as ReadonlyArray<{
    name?: string;
    $cstNode?: { offset: number; length: number };
  }>) {
    const name = el.name;
    const cst = el.$cstNode;
    if (!cst) continue;
    const spanText = importedText.slice(cst.offset, cst.offset + cst.length);
    const collision = name !== undefined && existingByName.has(name);

    if (!collision) {
      appendSpans.push(spanText);
      if (name !== undefined) allNames.add(name);
      continue;
    }

    if (options.onCollision === 'skip') {
      skipped.push(name!);
      continue;
    }

    if (options.onCollision === 'overwrite') {
      const existingEl = existingByName.get(name!)!;
      const existingCst = existingEl.$cstNode!;
      existingEdits.push({
        start: existingCst.offset,
        end: existingCst.offset + existingCst.length,
        replacement: spanText
      });
      overwritten.push(name!);
      continue;
    }

    // rename — only type/enum/choice/func declarations are safe to rename.
    // Shared meta-declarations (e.g. `synonym source <Name>`, emitted on
    // every import) are never renamed: other declarations' own synonym refs
    // still point at the original name, so renaming would corrupt them.
    // Treat a non-renamable collision as a skip instead.
    if (!DECL_NAME_RE.test(spanText)) {
      skipped.push(name!);
      continue;
    }
    const newName = uniqueDeclarationName(name!, allNames);
    allNames.add(newName);
    renamed.push({ from: name!, to: newName });
    appendSpans.push(renameDeclaration(spanText, newName));
  }

  let mergedExisting = existingText;
  for (const edit of existingEdits.sort((a, b) => b.start - a.start)) {
    mergedExisting = mergedExisting.slice(0, edit.start) + edit.replacement + mergedExisting.slice(edit.end);
  }

  const mergedText = appendSpans.length === 0 ? mergedExisting : `${mergedExisting}\n\n${appendSpans.join('\n\n')}`;

  const mergedParse = await parse(mergedText, 'inmemory:///merged.rosetta');
  if (mergedParse.hasErrors) {
    throw new Error('mergeImportedText: merged output failed to re-parse.');
  }

  return { mergedText, skipped, overwritten, renamed };
}
