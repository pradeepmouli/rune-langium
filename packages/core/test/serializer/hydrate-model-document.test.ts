// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { URI } from 'langium';
import {
  deserializeRuneModel,
  hydrateModelDocument,
  hydrateModelDocuments
} from '../../src/serializer/hydrate-model-document.js';

function makeFakeServices() {
  const added: unknown[] = [];
  const existingByUri = new Map<string, unknown>();
  const fakeDoc = { uri: 'x' };
  let deserializeCallCount = 0;
  const services = {
    RuneDsl: {
      serializer: {
        JsonSerializer: {
          deserialize: (json: string) => {
            deserializeCallCount++;
            return { $type: 'RosettaModel', parsed: json };
          }
        }
      }
    },
    shared: {
      workspace: {
        LangiumDocumentFactory: { fromModel: (_model: unknown, _uri: unknown) => fakeDoc },
        LangiumDocuments: {
          getDocument: (uri: { toString(): string }) => existingByUri.get(uri.toString()),
          addDocument: (doc: unknown) => added.push(doc)
        }
      }
    }
  };
  return { services, added, existingByUri, fakeDoc, getDeserializeCallCount: () => deserializeCallCount };
}

/**
 * Fake services whose deserialize() bakes in cross-document reference
 * resolution the same way Langium's real JsonSerializer does: a
 * ONE-SHOT lookup against `registered` at call time, permanently
 * unresolved if the target isn't registered yet. Lets the two-pass fix
 * be tested without a real Langium workspace.
 */
function makeCrossRefFakeServices() {
  const registered = new Map<string, { uri: string; parseResult: { value: unknown } }>();
  const deserializeCalls: string[] = [];

  function deserialize(json: string) {
    deserializeCalls.push(json);
    const { self, refUri } = JSON.parse(json) as { self: string; refUri?: string };
    // Normalize the same way hydrateModelDocuments resolves entry URIs
    // (URI.parse(...).toString()) so lookups by raw 'mem:///x' strings
    // match registration keys regardless of Langium's own URI normalization.
    const normalizedRefUri = refUri ? URI.parse(refUri).toString() : undefined;
    const target = normalizedRefUri ? registered.get(normalizedRefUri) : undefined;
    // Mirrors Langium: resolved AT DESERIALIZE TIME against whatever is
    // registered right now — never re-checked later.
    return {
      $type: 'RosettaModel',
      self,
      ref: normalizedRefUri ? { $refText: normalizedRefUri, ref: target?.parseResult.value } : undefined
    };
  }

  const services = {
    RuneDsl: { serializer: { JsonSerializer: { deserialize } } },
    shared: {
      workspace: {
        LangiumDocumentFactory: {
          fromModel: (model: unknown, uri: { toString(): string }) => ({
            uri: uri.toString(),
            parseResult: { value: model }
          })
        },
        LangiumDocuments: {
          getDocument: (uri: { toString(): string }) => registered.get(uri.toString()),
          addDocument: (doc: { uri: string }) => registered.set(doc.uri, doc as never),
          deleteDocument: (uri: { toString(): string }) => {
            const existing = registered.get(uri.toString());
            registered.delete(uri.toString());
            return existing as never;
          }
        }
      }
    }
  };
  return { services, registered, deserializeCalls };
}

describe('deserializeRuneModel', () => {
  it('deserializes via the RuneDsl JsonSerializer', () => {
    const { services } = makeFakeServices();
    const model = deserializeRuneModel(services as never, '{"a":1}');
    expect((model as { parsed: string }).parsed).toBe('{"a":1}');
  });
});

describe('hydrateModelDocument', () => {
  it("register:'none' returns model+document without adding", () => {
    const { services, added } = makeFakeServices();
    const { model, document } = hydrateModelDocument(services as never, URI.parse('mem:///a'), '{}', {
      register: 'none'
    });
    expect(model).toBeDefined();
    expect(document).toBeDefined();
    expect(added).toHaveLength(0);
  });
  it("register:'always' adds the document unconditionally", () => {
    const { services, added } = makeFakeServices();
    hydrateModelDocument(services as never, URI.parse('mem:///a'), '{}', { register: 'always' });
    expect(added).toHaveLength(1);
  });
  it("register:'idempotent' returns the existing document and does not re-add", () => {
    const { services, added, existingByUri, getDeserializeCallCount } = makeFakeServices();
    const uri = URI.parse('mem:///a');
    const existingModel = { $type: 'RosettaModel' as const };
    const existingDoc = { uri: 'existing', parseResult: { value: existingModel } };
    existingByUri.set(uri.toString(), existingDoc);
    const { model, document } = hydrateModelDocument(services as never, uri, '{}', { register: 'idempotent' });
    // document must be the pre-existing one
    expect(document).toBe(existingDoc);
    // model must come from the existing doc's parseResult, not from a fresh deserialize
    expect(model).toBe(existingModel);
    // deserialize must NOT have been called (no wasted work)
    expect(getDeserializeCallCount()).toBe(0);
    expect(added).toHaveLength(0);
  });
  it("register:'idempotent' adds when no existing document", () => {
    const { services, added } = makeFakeServices();
    hydrateModelDocument(services as never, URI.parse('mem:///b'), '{}', { register: 'idempotent' });
    expect(added).toHaveLength(1);
  });
  it('accepts a string uri and parses it', () => {
    const { services } = makeFakeServices();
    const { document } = hydrateModelDocument(services as never, 'mem:///c', '{}', { register: 'none' });
    expect(document).toBeDefined();
  });
});

describe('hydrateModelDocuments', () => {
  it('resolves a cross-document reference regardless of input order', () => {
    // Regression: single-document hydrateModelDocument in a loop bakes in
    // an unresolved cross-document ref if the target document hasn't been
    // registered yet at deserialize time (2026-07 investigation). The
    // "derived" entry's ref targets "base" — feeding them in derived-first
    // order is exactly the order that broke with the old one-pass approach.
    const { services } = makeCrossRefFakeServices();
    const base = JSON.stringify({ self: 'base' });
    const derived = JSON.stringify({ self: 'derived', refUri: 'mem:///base' });

    const results = hydrateModelDocuments(services as never, [
      { uri: 'mem:///derived', json: derived },
      { uri: 'mem:///base', json: base }
    ]);

    const derivedResult = results.find((r) => (r.model as { self: string }).self === 'derived')!;
    const ref = (derivedResult.model as { ref?: { ref?: unknown } }).ref;
    expect(ref?.ref).toBeDefined();
    expect((ref!.ref as { self: string }).self).toBe('base');
  });

  it('resolves regardless of order in the OPPOSITE direction too', () => {
    const { services } = makeCrossRefFakeServices();
    const base = JSON.stringify({ self: 'base' });
    const derived = JSON.stringify({ self: 'derived', refUri: 'mem:///base' });

    const results = hydrateModelDocuments(services as never, [
      { uri: 'mem:///base', json: base },
      { uri: 'mem:///derived', json: derived }
    ]);

    const derivedResult = results.find((r) => (r.model as { self: string }).self === 'derived')!;
    const ref = (derivedResult.model as { ref?: { ref?: unknown } }).ref;
    expect(ref?.ref).toBeDefined();
  });

  it('registers every document so a later same-batch lookup by URI finds the relinked version', () => {
    const { services, registered } = makeCrossRefFakeServices();
    const base = JSON.stringify({ self: 'base' });
    const derived = JSON.stringify({ self: 'derived', refUri: 'mem:///base' });

    hydrateModelDocuments(services as never, [
      { uri: 'mem:///derived', json: derived },
      { uri: 'mem:///base', json: base }
    ]);

    expect(registered.size).toBe(2);
    const registeredDerived = registered.get(URI.parse('mem:///derived').toString())!;
    const ref = (registeredDerived.parseResult.value as { ref?: { ref?: unknown } }).ref;
    expect(ref?.ref).toBeDefined();
  });

  it('an entry already registered before the call still gets relinked against this batch', () => {
    const { services } = makeCrossRefFakeServices();
    const base = JSON.stringify({ self: 'base' });
    const derived = JSON.stringify({ self: 'derived', refUri: 'mem:///base' });

    // First call registers "derived" alone — its ref is unresolved (base
    // isn't registered yet).
    const [firstPass] = hydrateModelDocuments(services as never, [{ uri: 'mem:///derived', json: derived }]);
    expect((firstPass!.model as { ref?: { ref?: unknown } }).ref?.ref).toBeUndefined();

    // Second call includes "derived" again alongside "base" — must relink,
    // not just return the stale first-pass registration.
    const results = hydrateModelDocuments(services as never, [
      { uri: 'mem:///derived', json: derived },
      { uri: 'mem:///base', json: base }
    ]);
    const derivedResult = results.find((r) => (r.model as { self: string }).self === 'derived')!;
    expect((derivedResult.model as { ref?: { ref?: unknown } }).ref?.ref).toBeDefined();
  });
});
