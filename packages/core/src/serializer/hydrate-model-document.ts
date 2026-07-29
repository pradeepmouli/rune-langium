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
 * Fix: pass 1 deserializes and registers every document in the batch
 * (accepting that cross-document refs may come back unresolved at this
 * point — every OTHER document in the batch isn't registered yet either).
 * Then a series of re-link ROUNDS repeats: re-deserialize every entry's
 * SAME raw JSON against the registry state left by the PREVIOUS round,
 * and only swap the round's results into `LangiumDocuments` once every
 * entry has been read — never mid-round.
 *
 * That last point matters for chains spanning 3+ documents (e.g.
 * `Data.superType` -> `Data.superType` -> `Data`, three levels deep, each
 * in its own document): a naive single extra pass that re-deserializes
 * and swaps entries one at a time, in a fixed order, resolves an
 * early-in-the-pass entry's reference against whatever (possibly
 * still-unlinked) sibling happens to be registered AT THAT MOMENT, then
 * freezes it — the sibling's OWN fix later in the same pass never
 * propagates back, since a `Reference`'s resolved target is a one-shot
 * object-identity capture, not a live indirection through the registry.
 * Reading the whole round before writing any of it avoids that: a
 * reference resolved this round always sees LAST round's fully-swapped-in
 * state, so each round resolves one additional hop of chain depth.
 *
 * Runs exactly `entries.length` rounds unconditionally — the same
 * argument that bounds Bellman-Ford's shortest-path relaxation to V-1
 * rounds applies here: one round resolves every reference whose target
 * chain (within the batch) is at most as many hops deep as rounds run so
 * far, so `entries.length` rounds covers the worst case of an N-document
 * batch whose deepest reference chain spans every document. Cheap to run
 * in full for the realistic batch sizes this hydrates (one curated
 * namespace closure per fetch, not an unbounded corpus) — correctness
 * matters more here than shaving redundant rounds off the common case
 * where most batches only need 1–2.
 *
 * Does NOT fix references to documents outside this batch (those must
 * already be registered, or need their own `hydrateModelDocuments` call)
 * — the caller is responsible for including every document whose
 * cross-references need resolving in one `entries` call.
 */
export function hydrateModelDocuments(
  services: HydrateServices,
  entries: ReadonlyArray<{ uri: URI | string; json: string }>
): Array<{ model: RosettaModel; document: LangiumDocument }> {
  const documents = services.shared.workspace.LangiumDocuments;
  const factory = services.shared.workspace.LangiumDocumentFactory;
  const resolvedUris = entries.map((e) => (typeof e.uri === 'string' ? URI.parse(e.uri) : e.uri));

  // Pass 1 — deserialize + register a placeholder for every not-yet-
  // registered entry, so the first re-link round below has something to
  // resolve sibling references against. Skips entries whose URI is
  // already registered (idempotent, matching hydrateModelDocument), but
  // the round loop still re-links them: an already-registered document
  // from a PRIOR call may itself have unresolved references into THIS
  // batch.
  for (let i = 0; i < entries.length; i++) {
    if (documents.getDocument(resolvedUris[i]!)) continue;
    const model = deserializeRuneModel(services, entries[i]!.json);
    documents.addDocument(factory.fromModel(model, resolvedUris[i]!));
  }

  let results: Array<{ model: RosettaModel; document: LangiumDocument }> = [];
  for (let round = 0; round < entries.length; round++) {
    // Read every entry against the registry state left by the previous
    // round first; swap all of them in only after the whole round has
    // been read (see doc comment above for why mid-round swaps break
    // 3+-document chains).
    results = entries.map((entry, i) => {
      const model = deserializeRuneModel(services, entry.json);
      return { model, document: factory.fromModel(model, resolvedUris[i]!) };
    });
    for (let i = 0; i < entries.length; i++) {
      documents.deleteDocument?.(resolvedUris[i]!);
      documents.addDocument(results[i]!.document);
    }
  }
  return results;
}
