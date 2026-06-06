// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { URI, type AstNode, type LangiumDocument } from 'langium';
import type { RosettaModel } from '../generated/ast.js';

export interface HydrateServices {
  RuneDsl: { serializer: { JsonSerializer: { deserialize<T extends AstNode>(content: string): T } } };
  shared: {
    workspace: {
      LangiumDocumentFactory: { fromModel(model: AstNode, uri: URI): LangiumDocument };
      LangiumDocuments: {
        getDocument(uri: URI): LangiumDocument | undefined;
        addDocument(document: LangiumDocument): void;
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
  const model = deserializeRuneModel(services, json);
  const factory = services.shared.workspace.LangiumDocumentFactory;
  const documents = services.shared.workspace.LangiumDocuments;

  if (options.register === 'idempotent') {
    const existing = documents.getDocument(resolvedUri);
    if (existing) {
      return { model, document: existing };
    }
  }

  const document = factory.fromModel(model, resolvedUri);
  if (options.register === 'always' || options.register === 'idempotent') {
    documents.addDocument(document);
  }
  return { model, document };
}
