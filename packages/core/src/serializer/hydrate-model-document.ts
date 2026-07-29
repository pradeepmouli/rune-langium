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

/**
 * Hydrate a BATCH of serialized documents together, resolving
 * cross-document references correctly regardless of input order.
 *
 * Langium's `JsonSerializer.deserialize()` resolves a cross-document
 * reference (one whose serialized `$ref` names another document's URI)
 * via a ONE-SHOT synchronous lookup against whatever documents are
 * ALREADY registered in `LangiumDocuments` at that exact moment — not a
 * live/lazy getter re-checked later. Hydrating documents one at a time via
 * `hydrateModelDocument` in whatever order a fetch/BFS happened to produce
 * permanently bakes in an unresolved reference (`.ref === undefined`) for
 * any reference whose target document hadn't been registered yet — e.g. a
 * `Data.superType` pointing at a type in a namespace fetched later in the
 * same batch, or two files in the same namespace processed out of order.
 * Found and isolated via a minimal, order-controlled repro (2026-07
 * codegen cross-document resolution investigation): identical serialized
 * JSON, identical options, only the hydration ORDER differed between a
 * run where the reference resolved and one where it didn't.
 *
 * Fix: two passes. Pass 1 deserializes and registers every document in
 * the batch (accepting that cross-document refs may come back unresolved
 * at this point — every OTHER document in the batch isn't registered yet
 * either). Pass 2 re-deserializes each entry's SAME raw JSON a second
 * time — now that every sibling URI in the batch is registered, any
 * reference targeting another document in this batch resolves correctly
 * — and replaces the pass-1 placeholder in `LangiumDocuments` with the
 * correctly-linked pass-2 result, so any other document's reference that
 * resolves via `documents.getDocument(uri)` also sees the relinked
 * version rather than the stale pass-1 one.
 *
 * Does NOT fix references to documents outside this batch (those need
 * their own two-pass treatment, or must already be registered before
 * this call) — the caller is responsible for including every document
 * whose cross-references need resolving in one `entries` call.
 */
export function hydrateModelDocuments(
  services: HydrateServices,
  entries: ReadonlyArray<{ uri: URI | string; json: string }>
): Array<{ model: RosettaModel; document: LangiumDocument }> {
  const documents = services.shared.workspace.LangiumDocuments;
  const factory = services.shared.workspace.LangiumDocumentFactory;
  const resolvedUris = entries.map((e) => (typeof e.uri === 'string' ? URI.parse(e.uri) : e.uri));

  // Pass 1 — deserialize + register every document. Skips entries whose
  // URI is already registered (idempotent, matching hydrateModelDocument),
  // but still re-links them in pass 2 below: an already-registered
  // document from a PRIOR call may itself have unresolved references into
  // THIS batch.
  for (let i = 0; i < entries.length; i++) {
    if (documents.getDocument(resolvedUris[i]!)) continue;
    const model = deserializeRuneModel(services, entries[i]!.json);
    documents.addDocument(factory.fromModel(model, resolvedUris[i]!));
  }

  // Pass 2 — re-deserialize each entry now that every sibling URI in the
  // batch is registered, then swap the registered document for this
  // correctly-linked version.
  return entries.map((entry, i) => {
    const uri = resolvedUris[i]!;
    const model = deserializeRuneModel(services, entry.json);
    const document = factory.fromModel(model, uri);
    documents.deleteDocument?.(uri);
    documents.addDocument(document);
    return { model, document };
  });
}
