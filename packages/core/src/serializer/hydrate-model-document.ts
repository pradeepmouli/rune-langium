// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { URI, type AstNode, type LangiumDocument } from 'langium';
import type { RuneJsonSerializer } from './rune-json-serializer.js';
import type { RosettaModel } from '../generated/ast.js';

export interface HydrateServices {
  RuneDsl: { serializer: { JsonSerializer: { deserialize<T extends AstNode>(content: string): T } } };
  shared: {
    workspace: {
      LangiumDocumentFactory: { fromModel(model: AstNode, uri: URI): LangiumDocument };
      LangiumDocuments: {
        getDocument(uri: URI): LangiumDocument | undefined;
        addDocument(document: LangiumDocument): void;
        deleteDocument?(uri: URI): LangiumDocument | undefined;
      };
    };
  };
}

/** Deserialize a serialized Rune AST JSON string back to a `RosettaModel`. */
export function deserializeRuneModel(services: HydrateServices, json: string): RosettaModel {
  return services.RuneDsl.serializer.JsonSerializer.deserialize<RosettaModel>(json);
}

export interface HydrateOptions {
  register: 'none' | 'always' | 'idempotent';
}

/**
 * Deserialize a serialized Rune AST and build a `LangiumDocument`, optionally
 * registering it. `'none'` builds without registering (a later
 * `DocumentBuilder.build` will); `'always'` registers unconditionally;
 * `'idempotent'` returns an existing document for `uri` if present, else
 * registers the new one. Worker-local concerns (accumulators, deferred-json
 * eviction) stay at the call site. (V9 — single source of truth.)
 */
export function hydrateModelDocument(
  services: HydrateServices,
  uri: URI | string,
  json: string,
  options: HydrateOptions
): { model: RosettaModel; document: LangiumDocument } {
  const resolvedUri = typeof uri === 'string' ? URI.parse(uri) : uri;
  const documents = services.shared.workspace.LangiumDocuments;

  if (options.register === 'idempotent') {
    const existing = documents.getDocument(resolvedUri);
    if (existing) {
      // Return the consistent pair: the existing document's own model, no wasted deserialize.
      return { model: existing.parseResult.value as RosettaModel, document: existing };
    }
  }

  const model = deserializeRuneModel(services, json);
  const factory = services.shared.workspace.LangiumDocumentFactory;
  const document = factory.fromModel(model, resolvedUri);
  if (options.register === 'always' || options.register === 'idempotent') {
    documents.addDocument(document);
  }
  return { model, document };
}

/** Hydrate and link one shared object graph, regardless of reference depth or input order. */
export function hydrateModelDocuments(
  services: HydrateServices & {
    RuneDsl: { serializer: { JsonSerializer: Pick<RuneJsonSerializer, 'deserializeModels'> } };
    shared: { workspace: { LangiumDocuments: { deleteDocument(uri: URI): LangiumDocument | undefined } } };
  },
  entries: ReadonlyArray<{ uri: URI | string; json: string }>
): Array<{ model: RosettaModel; document: LangiumDocument }> {
  const documents = services.shared.workspace.LangiumDocuments;
  const factory = services.shared.workspace.LangiumDocumentFactory;
  const resolvedUris = entries.map((entry) => (typeof entry.uri === 'string' ? URI.parse(entry.uri) : entry.uri));
  if (new Set(resolvedUris.map((uri) => uri.toString())).size !== entries.length) {
    throw new Error('Cannot hydrate duplicate document URIs in one batch');
  }
  const previous = resolvedUris.map((uri) => documents.getDocument(uri));
  let results: Array<{ model: RosettaModel; document: LangiumDocument }> = [];
  try {
    services.RuneDsl.serializer.JsonSerializer.deserializeModels<RosettaModel>(
      entries.map((entry) => entry.json),
      (models) => {
        results = models.map((model, i) => ({ model, document: factory.fromModel(model, resolvedUris[i]!) }));
        for (const result of results) {
          documents.deleteDocument(result.document.uri);
          documents.addDocument(result.document);
        }
      }
    );
    return results;
  } catch (error) {
    for (let i = 0; i < results.length; i++) {
      documents.deleteDocument(resolvedUris[i]!);
      if (previous[i]) documents.addDocument(previous[i]!);
    }
    throw error;
  }
}
