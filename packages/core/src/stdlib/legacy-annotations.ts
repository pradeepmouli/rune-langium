// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { LangiumDocument, LangiumDocumentFactory } from 'langium';
import { isAnnotation, isRosettaModel } from '../generated/ast.js';

/** Upstream legacy function annotations retained for mixed Rune dialect workspaces. */
export const LEGACY_ANNOTATIONS = {
  ingest: `annotation ingest: <"Marks a function that performs ingestion operations with the in bound serialisation format">
\tJSON boolean (0..1)
\tRUNE_JSON boolean (0..1)
\tXML boolean (0..1)
\tCSV boolean (0..1)`,
  enrich: `annotation enrich: <"Marks a function that performs enrichment operations">`,
  projection: `annotation projection: <"Marks a function that performs projection operations with the out bound serialisation format">
\tJSON boolean (0..1)
\tRUNE_JSON boolean (0..1)
\tXML boolean (0..1)
\tCSV boolean (0..1)`
} as const;

/** Add missing legacy declarations to the runtime annotation document before linking. */
export function addLegacyAnnotations(document: LangiumDocument, factory: LangiumDocumentFactory): LangiumDocument {
  const model = document.parseResult.value;
  if (!isRosettaModel(model) || model.name !== 'com.rosetta.model') return document;
  const names = new Set(model.elements.filter(isAnnotation).map((annotation) => annotation.name));
  const missing = Object.entries(LEGACY_ANNOTATIONS)
    .filter(([name]) => !names.has(name))
    .map(([, source]) => source);
  return missing.length === 0
    ? document
    : factory.fromString(`${document.textDocument.getText()}\n${missing.join('\n\n')}\n`, document.uri);
}
