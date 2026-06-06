// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { URI } from 'langium';
import { deserializeRuneModel, hydrateModelDocument } from '../../src/serializer/hydrate-model-document.js';

function makeFakeServices() {
  const added: unknown[] = [];
  const existingByUri = new Map<string, unknown>();
  const fakeDoc = { uri: 'x' };
  const services = {
    RuneDsl: {
      serializer: { JsonSerializer: { deserialize: (json: string) => ({ $type: 'RosettaModel', parsed: json }) } }
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
  return { services, added, existingByUri, fakeDoc };
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
    const { model, document } = hydrateModelDocument(services as never, URI.parse('mem:///a'), '{}', { register: 'none' });
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
    const { services, added, existingByUri } = makeFakeServices();
    const uri = URI.parse('mem:///a');
    existingByUri.set(uri.toString(), { uri: 'existing' });
    const { document } = hydrateModelDocument(services as never, uri, '{}', { register: 'idempotent' });
    expect(document).toEqual({ uri: 'existing' });
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
