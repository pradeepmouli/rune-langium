// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import type { LangiumDocument } from 'langium';

/** Artifact publication must never turn a parser-recovered AST into trusted source. */
export function assertValidDocuments(documents: readonly LangiumDocument[]): void {
  const failures = documents.flatMap((document) => {
    const errors = [...document.parseResult.lexerErrors, ...document.parseResult.parserErrors];
    return errors.length ? [`${document.uri}: ${errors.length} parse error(s): ${errors[0]!.message}`] : [];
  });
  if (failures.length) throw new Error(`Cannot serialize invalid documents:\n${failures.join('\n')}`);
}
