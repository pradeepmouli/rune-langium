// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { DocumentState, type LangiumDocument } from 'langium';

/** Publication requires syntax-correct documents with every reference linked. */
export function assertValidDocuments(documents: readonly LangiumDocument[]): void {
  const failures = documents.flatMap((document) => {
    const errors = [...document.parseResult.lexerErrors, ...document.parseResult.parserErrors];
    if (errors.length) return [`${document.uri}: ${errors.length} parse error(s): ${errors[0]!.message}`];
    if (document.state < DocumentState.Linked) return [`${document.uri}: document has not been linked`];
    const linkingErrors = document.references.flatMap((reference) => (reference.error ? [reference.error] : []));
    return linkingErrors.length
      ? [`${document.uri}: ${linkingErrors.length} linking error(s): ${linkingErrors[0]!.message}`]
      : [];
  });
  if (failures.length) throw new Error(`Cannot serialize invalid documents:\n${failures.join('\n')}`);
}
