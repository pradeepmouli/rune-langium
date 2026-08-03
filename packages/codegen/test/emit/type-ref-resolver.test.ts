// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { createRuneDslServices, isData, isChoice, isRosettaEnumeration, isRosettaTypeAlias } from '@rune-langium/core';
import { EmptyFileSystem } from 'langium';
import { URI } from 'langium';
import type { Data, RosettaEnumeration, Choice, RosettaTypeAlias, RosettaModel, TypeCall } from '@rune-langium/core';
import {
  resolveTypeCallTarget,
  type TypeIndexLookup,
  type TypeResolutionVisitor
} from '../../src/emit/type-ref-resolver.js';

const services = createRuneDslServices(EmptyFileSystem).RuneDsl;

async function parseNamespace(source: string): Promise<{ model: RosettaModel; index: TypeIndexLookup }> {
  const doc = services.shared.workspace.LangiumDocumentFactory.fromString<RosettaModel>(
    source,
    URI.parse('file:///test.rosetta')
  );
  await services.shared.workspace.DocumentBuilder.build([doc], { validation: false });
  const model = doc.parseResult.value;
  const index: TypeIndexLookup = {
    enumByName: new Map(),
    dataByName: new Map(),
    choiceByName: new Map(),
    typeAliasByName: new Map()
  };
  for (const el of model.elements) {
    const sourceUri = 'file:///test.rosetta';
    if (isData(el)) (index.dataByName as Map<string, unknown>).set(el.name, { node: el, sourceUri });
    if (isRosettaEnumeration(el)) (index.enumByName as Map<string, unknown>).set(el.name, { node: el, sourceUri });
    if (isChoice(el)) (index.choiceByName as Map<string, unknown>).set(el.name, { node: el, sourceUri });
    if (isRosettaTypeAlias(el)) (index.typeAliasByName as Map<string, unknown>).set(el.name, { node: el, sourceUri });
  }
  return { model, index };
}

function findAttrTypeCall(data: Data, attrName: string) {
  const attr = data.attributes.find((a) => a.name === attrName);
  if (!attr) throw new Error(`attribute ${attrName} not found`);
  return attr.typeCall;
}

interface Recorded {
  kind: 'primitive' | 'enum' | 'data' | 'choice' | 'unresolved';
  value?: string;
}

function recordingVisitor(): TypeResolutionVisitor<Recorded> {
  return {
    onPrimitive: (basicTypeName) => ({ kind: 'primitive', value: basicTypeName }),
    onEnum: (node) => ({ kind: 'enum', value: node.name }),
    onData: (node) => ({ kind: 'data', value: node.name }),
    onChoice: (node) => ({ kind: 'choice', value: node.name }),
    onUnresolved: (refText) => ({ kind: 'unresolved', value: refText })
  };
}

describe('resolveTypeCallTarget', () => {
  it('resolves a primitive-typed field', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      type Foo:
        bar string (0..1)
    `);
    const data = model.elements.find((e) => isData(e) && e.name === 'Foo') as Data;
    const result = resolveTypeCallTarget(
      findAttrTypeCall(data, 'bar'),
      index,
      recordingVisitor(),
      'file:///test.rosetta'
    );
    expect(result).toEqual({ kind: 'primitive', value: 'string' });
  });

  it('resolves an enum-typed field', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      enum Color: RED GREEN BLUE
      type Foo:
        bar Color (0..1)
    `);
    const data = model.elements.find((e) => isData(e) && e.name === 'Foo') as Data;
    const result = resolveTypeCallTarget(
      findAttrTypeCall(data, 'bar'),
      index,
      recordingVisitor(),
      'file:///test.rosetta'
    );
    expect(result).toEqual({ kind: 'enum', value: 'Color' });
  });

  it('resolves a data-typed field', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      type Bar:
        x string (0..1)
      type Foo:
        bar Bar (0..1)
    `);
    const data = model.elements.find((e) => isData(e) && e.name === 'Foo') as Data;
    const result = resolveTypeCallTarget(
      findAttrTypeCall(data, 'bar'),
      index,
      recordingVisitor(),
      'file:///test.rosetta'
    );
    expect(result).toEqual({ kind: 'data', value: 'Bar' });
  });

  it('resolves a choice-typed field', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      choice Bar: X Y
      type X: a string (0..1)
      type Y: b string (0..1)
      type Foo:
        bar Bar (0..1)
    `);
    const data = model.elements.find((e) => isData(e) && e.name === 'Foo') as Data;
    const result = resolveTypeCallTarget(
      findAttrTypeCall(data, 'bar'),
      index,
      recordingVisitor(),
      'file:///test.rosetta'
    );
    expect(result).toEqual({ kind: 'choice', value: 'Bar' });
  });

  it('resolves a type-alias-to-primitive field to the primitive kind (the production bug)', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      typeAlias MyAlias: string
      type Foo:
        bar MyAlias (0..1)
    `);
    const data = model.elements.find((e) => isData(e) && e.name === 'Foo') as Data;
    const result = resolveTypeCallTarget(
      findAttrTypeCall(data, 'bar'),
      index,
      recordingVisitor(),
      'file:///test.rosetta'
    );
    expect(result).toEqual({ kind: 'primitive', value: 'string' });
  });

  it('resolves a type-alias-to-data field to the data kind', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      type Bar:
        x string (0..1)
      typeAlias MyAlias: Bar
      type Foo:
        bar MyAlias (0..1)
    `);
    const data = model.elements.find((e) => isData(e) && e.name === 'Foo') as Data;
    const result = resolveTypeCallTarget(
      findAttrTypeCall(data, 'bar'),
      index,
      recordingVisitor(),
      'file:///test.rosetta'
    );
    expect(result).toEqual({ kind: 'data', value: 'Bar' });
  });

  it('chases a 2-hop alias-to-alias-to-primitive chain', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      typeAlias Inner: string
      typeAlias Outer: Inner
      type Foo:
        bar Outer (0..1)
    `);
    const data = model.elements.find((e) => isData(e) && e.name === 'Foo') as Data;
    const result = resolveTypeCallTarget(
      findAttrTypeCall(data, 'bar'),
      index,
      recordingVisitor(),
      'file:///test.rosetta'
    );
    expect(result).toEqual({ kind: 'primitive', value: 'string' });
  });

  it('reports unresolved for a field with no type reference match', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      type Foo:
        bar string (0..1)
    `);
    const data = model.elements.find((e) => isData(e) && e.name === 'Foo') as Data;
    const typeCall = findAttrTypeCall(data, 'bar')!;
    // Simulate an unresolved reference: strip the AST link, keep only $refText.
    const brokenTypeCall = {
      ...typeCall,
      type: { ...typeCall.type, ref: undefined, $refText: 'NoSuchType' }
    } as typeof typeCall;
    const result = resolveTypeCallTarget(brokenTypeCall, index, recordingVisitor(), 'file:///test.rosetta');
    expect(result).toEqual({ kind: 'unresolved', value: 'NoSuchType' });
  });

  it('breaks a circular alias chain via onUnresolved instead of looping forever', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      typeAlias A: B
      typeAlias B: A
      type Foo:
        bar A (0..1)
    `);
    const data = model.elements.find((e) => isData(e) && e.name === 'Foo') as Data;
    const result = resolveTypeCallTarget(
      findAttrTypeCall(data, 'bar'),
      index,
      recordingVisitor(),
      'file:///test.rosetta'
    );
    expect(result.kind).toBe('unresolved');
  });

  it('falls back to $refText-against-namespace-index lookup when typeRef is absent (single-file/fixture case)', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      type Bar:
        x string (0..1)
      type Foo:
        bar Bar (0..1)
    `);
    const data = model.elements.find((e) => isData(e) && e.name === 'Foo') as Data;
    const typeCall = findAttrTypeCall(data, 'bar')!;
    const refTextOnlyTypeCall = {
      ...typeCall,
      type: { ...typeCall.type, ref: undefined, $refText: 'Bar' }
    } as typeof typeCall;
    const result = resolveTypeCallTarget(refTextOnlyTypeCall, index, recordingVisitor(), 'file:///test.rosetta');
    expect(result).toEqual({ kind: 'data', value: 'Bar' });
  });
});
