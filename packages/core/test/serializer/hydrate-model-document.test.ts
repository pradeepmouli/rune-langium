// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { createRuneDslServices } from '../../src/index.js';
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
  function entry(index: number, target?: number) {
    return {
      uri: `file:///model${index}.rosetta`,
      json: JSON.stringify({
        $type: 'RosettaModel',
        name: `n${index}`,
        elements: [
          {
            $type: 'Data',
            name: `T${index}`,
            attributes: [],
            ...(target === undefined
              ? {}
              : { superType: { $refText: `T${target}`, $ref: `file:///model${target}.rosetta#/elements@0` } })
          }
        ],
        imports: []
      })
    };
  }

  it.each([false, true])('resolves a 20-document cyclic chain with exact target identity (reverse=%s)', (reverse) => {
    const services = createRuneDslServices();
    const entries = Array.from({ length: 20 }, (_, i) => entry(i, (i + 1) % 20));
    if (reverse) entries.reverse();
    const results = hydrateModelDocuments(services, entries);
    for (const { model } of results) {
      const node = model.elements[0]!;
      expect(node.$type).toBe('Data');
      if (node.$type !== 'Data') throw new Error('Expected Data');
      const targetIndex = (Number(node.name.slice(1)) + 1) % 20;
      const target = services.shared.workspace.LangiumDocuments.getDocument(URI.parse(entry(targetIndex).uri))!
        .parseResult.value;
      expect(node.superType?.ref).toBe((target as typeof model).elements[0]);
    }
  });

  it('replaces a previously unresolved document when its sibling joins the batch', () => {
    const services = createRuneDslServices();
    hydrateModelDocuments(services, [entry(0, 1)]);
    const [first, second] = hydrateModelDocuments(services, [entry(0, 1), entry(1)]);
    const node = first!.model.elements[0]!;
    expect(node.$type === 'Data' && node.superType?.ref).toBe(second!.model.elements[0]);
  });

  it('does not replace existing documents when any JSON in the batch is malformed', () => {
    const services = createRuneDslServices();
    const [first] = hydrateModelDocuments(services, [entry(0)]);
    expect(() => hydrateModelDocuments(services, [entry(0, 1), { uri: entry(1).uri, json: '{' }])).toThrow();
    expect(services.shared.workspace.LangiumDocuments.getDocument(first!.document.uri)).toBe(first!.document);
  });

  it('rejects duplicate document URIs', () => {
    expect(() => hydrateModelDocuments(createRuneDslServices(), [entry(0), entry(0)])).toThrow(/duplicate/);
  });
});
