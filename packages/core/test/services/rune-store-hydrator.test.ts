// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { URI } from 'langium';
import { describe, expect, it } from 'vitest';
import type { Data, RosettaModel } from '../../src/generated/ast.js';
import { createRuneDslServices } from '../../src/services/rune-dsl-module.js';
import { RuneStoreHydrator } from '../../src/services/rune-store-hydrator.js';
import { serializeRuneModel } from '../../src/serializer/rune-serialize.js';

const minimalServices = {
  Grammar: {},
  parser: { Lexer: {} },
  references: { Linker: {} }
} as any;

function makeDataInNamespace(namespace: string): Data {
  const model = {
    $type: 'RosettaModel',
    name: namespace,
    $container: undefined
  } as unknown as RosettaModel;

  return {
    $type: 'Data',
    name: { $type: 'ValidID', value: 'MyData' },
    attributes: [],
    $container: model,
    $containerProperty: 'elements',
    $containerIndex: 0,
    $cstNode: undefined,
    $document: undefined
  } as unknown as Data;
}

describe('RuneStoreHydrator.dehydrateNode — Dehydrated<T> runtime shape', () => {
  it('strips $containerIndex, $containerProperty, and $cstNode from the output', () => {
    const hydrator = new RuneStoreHydrator(minimalServices);
    const data = makeDataInNamespace('rosetta.base.staticnode');
    (data as unknown as Record<string, unknown>).$cstNode = { text: 'type MyData:' };
    const dehydrated = hydrator.dehydrateNode(data) as unknown as Record<string, unknown>;
    expect(dehydrated).not.toHaveProperty('$containerIndex');
    expect(dehydrated).not.toHaveProperty('$containerProperty');
    expect(dehydrated).not.toHaveProperty('$cstNode');
    expect(dehydrated).not.toHaveProperty('$container');
    expect(dehydrated).not.toHaveProperty('$document');
  });

  it('preserves the preserveCstText $cstText stamp', () => {
    const hydrator = new RuneStoreHydrator(minimalServices);
    const data = makeDataInNamespace('rosetta.base.staticnode');
    (data as unknown as Record<string, unknown>).$cstText = 'type MyData:';
    const dehydrated = hydrator.dehydrateNode(data) as unknown as Record<string, unknown>;
    expect(dehydrated.$cstText).toBe('type MyData:');
  });

  it('converts references to strict { $refText } (no ref/$refNode)', () => {
    const hydrator = new RuneStoreHydrator(minimalServices);
    const data = makeDataInNamespace('rosetta.base.staticnode');
    (data as unknown as Record<string, unknown>).superType = {
      $refText: 'Parent',
      ref: { $type: 'Data', name: 'Parent' },
      $refNode: {}
    };
    const dehydrated = hydrator.dehydrateNode(data) as unknown as Record<string, unknown>;
    expect(dehydrated.superType).toEqual({ $refText: 'Parent' });
  });
});

describe('RuneStoreHydrator.$namespace stamping', () => {
  it('stamps $namespace from containing RosettaModel', () => {
    const hydrator = new RuneStoreHydrator(minimalServices);
    const data = makeDataInNamespace('rosetta.base.staticnode');
    const dehydrated = hydrator.dehydrateNode(data);
    expect(dehydrated.$namespace).toBe('rosetta.base.staticnode');
  });

  it('leaves $namespace undefined for nodes with no RosettaModel ancestor', () => {
    const hydrator = new RuneStoreHydrator(minimalServices);
    const data = {
      $type: 'Data',
      attributes: [],
      $container: undefined
    } as unknown as Data;
    const dehydrated = hydrator.dehydrateNode(data);
    expect(dehydrated.$namespace).toBeUndefined();
  });
});

describe('RuneStoreHydrator.dehydrateAstNode — $cstRange stamping', () => {
  it('stamps $cstRange from $cstNode.offset/.end when a live CST node is present', () => {
    const hydrator = new RuneStoreHydrator(minimalServices);
    const data = makeDataInNamespace('rosetta.base.staticnode');
    (data as unknown as Record<string, unknown>).$cstNode = { offset: 5, end: 17 };
    const dehydrated = hydrator.dehydrateNode(data) as unknown as Record<string, unknown>;
    expect(dehydrated.$cstRange).toEqual({ offset: 5, end: 17 });
  });

  it('falls back to $textRegion when $cstNode is absent — real parse/serialize/deserialize round-trip', async () => {
    // This is the exact production regression: /api/parse serializes with
    // RUNE_SERIALIZE_OPTIONS (textRegions: true), and Langium's JsonSerializer
    // never reconstructs $cstNode on deserialize — only $textRegion survives.
    const { RuneDsl } = createRuneDslServices();
    const uri = URI.parse('inmemory:///cst-range-fallback.rosetta');
    const source = [
      'namespace rosetta.base.staticnode',
      'version "1.0.0"',
      '',
      'type MyData:',
      '  quantity number (1..1)',
      ''
    ].join('\n');
    const document = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString<RosettaModel>(source, uri);
    await RuneDsl.shared.workspace.DocumentBuilder.build([document]);

    const model = document.parseResult.value;
    const originalData = model.elements[0] as Data;
    expect(originalData.$cstNode).toBeDefined();
    const expectedRange = { offset: originalData.$cstNode!.offset, end: originalData.$cstNode!.end };

    const json = serializeRuneModel(RuneDsl.serializer.JsonSerializer, model);
    const deserializedModel = RuneDsl.serializer.JsonSerializer.deserialize<RosettaModel>(json);
    const deserializedData = deserializedModel.elements[0] as Data;

    // Confirms the premise: deserialize never reconstructs $cstNode, but does
    // carry the plain $textRegion snapshot.
    expect(deserializedData.$cstNode).toBeUndefined();
    expect((deserializedData as unknown as Record<string, unknown>).$textRegion).toBeDefined();

    const hydrator = new RuneStoreHydrator(minimalServices);
    const dehydrated = hydrator.dehydrateNode(deserializedData) as unknown as Record<string, unknown>;
    expect(dehydrated.$cstRange).toEqual(expectedRange);
  });

  it('leaves $cstRange absent when neither $cstNode nor $textRegion is present', () => {
    const hydrator = new RuneStoreHydrator(minimalServices);
    const data = makeDataInNamespace('rosetta.base.staticnode');
    const dehydrated = hydrator.dehydrateNode(data) as unknown as Record<string, unknown>;
    expect(dehydrated).not.toHaveProperty('$cstRange');
  });

  it('falls back to $textRegion when $cstNode is present but malformed (missing offset/end)', () => {
    const hydrator = new RuneStoreHydrator(minimalServices);
    const data = makeDataInNamespace('rosetta.base.staticnode');
    (data as unknown as Record<string, unknown>).$cstNode = { text: 'type MyData:' };
    (data as unknown as Record<string, unknown>).$textRegion = { offset: 42, end: 55 };
    const dehydrated = hydrator.dehydrateNode(data) as unknown as Record<string, unknown>;
    expect(dehydrated.$cstRange).toEqual({ offset: 42, end: 55 });
  });
});
