// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { createRuneDslServices, isData, isChoice, isRosettaEnumeration, isRosettaTypeAlias } from '@rune-langium/core';
import { EmptyFileSystem } from 'langium';
import { URI } from 'langium';
import type { Data, RosettaModel } from '@rune-langium/core';
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

  /**
   * PR #469 live review finding (2026-08-04): the old `for (hop = 0; hop <=
   * MAX_ALIAS_CHAIN; hop++)` loop silently misreported ANY genuinely valid,
   * non-cyclic chain longer than 32 hops as unresolved — the `visitedAliases`
   * `Set` cycle guard alone already guarantees termination (a real cycle is
   * caught the moment a previously-seen alias recurs), so the hop cap was a
   * redundant bound that could only ever misfire, never help. Removed in
   * favor of `for (;;)` relying solely on the `Set` guard.
   */
  it('chases a 40-hop (deliberately > the old 32-hop cap) non-cyclic alias-to-alias-to-primitive chain', async () => {
    const CHAIN_LENGTH = 40;
    const aliasLines = [`typeAlias Alias0: string`];
    for (let i = 1; i <= CHAIN_LENGTH; i++) {
      aliasLines.push(`typeAlias Alias${i}: Alias${i - 1}`);
    }
    const { model, index } = await parseNamespace(`
      namespace test
      ${aliasLines.join('\n      ')}
      type Foo:
        bar Alias${CHAIN_LENGTH} (0..1)
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

  it('resolves a RosettaRecordType-typed field (date with linked typeRef) to primitive', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      recordType date { day int month int year int }
      type Foo:
        createdAt date (0..1)
    `);
    const data = model.elements.find((e) => isData(e) && e.name === 'Foo') as Data;
    const result = resolveTypeCallTarget(
      findAttrTypeCall(data, 'createdAt'),
      index,
      recordingVisitor(),
      'file:///test.rosetta'
    );
    // With local recordType declaration, date now resolves to genuine RosettaRecordType node,
    // and our isRosettaRecordType check correctly routes to onPrimitive
    expect(result).toEqual({ kind: 'primitive', value: 'date' });
  });

  it('resolves dateTime (RosettaRecordType) with linked typeRef to primitive', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      recordType time { hour int minute int second int }
      recordType date { day int month int year int }
      recordType dateTime { date date time time }
      type Foo:
        timestamp dateTime (0..1)
    `);
    const data = model.elements.find((e) => isData(e) && e.name === 'Foo') as Data;
    const result = resolveTypeCallTarget(
      findAttrTypeCall(data, 'timestamp'),
      index,
      recordingVisitor(),
      'file:///test.rosetta'
    );
    // With local recordType declaration, dateTime now resolves to genuine RosettaRecordType node,
    // and our isRosettaRecordType check correctly routes to onPrimitive
    expect(result).toEqual({ kind: 'primitive', value: 'dateTime' });
  });

  it('handles undefined typeCall by calling onUnresolved', async () => {
    const { index } = await parseNamespace(`
      namespace test
    `);
    const result = resolveTypeCallTarget(undefined, index, recordingVisitor(), 'file:///test.rosetta');
    expect(result).toEqual({ kind: 'unresolved', value: undefined });
  });

  it('resolves eventType via linked typeRef to primitive', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      type Foo:
        event eventType (0..1)
    `);
    const data = model.elements.find((e) => isData(e) && e.name === 'Foo') as Data;
    const result = resolveTypeCallTarget(
      findAttrTypeCall(data, 'event'),
      index,
      recordingVisitor(),
      'file:///test.rosetta'
    );
    // If eventType is a builtin, expect primitive with 'eventType' name
    expect(result.kind).toBe('primitive');
    expect(result.value).toBe('eventType');
  });

  it('resolves calculation via linked typeRef to primitive', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      type Foo:
        calc calculation (0..1)
    `);
    const data = model.elements.find((e) => isData(e) && e.name === 'Foo') as Data;
    const result = resolveTypeCallTarget(
      findAttrTypeCall(data, 'calc'),
      index,
      recordingVisitor(),
      'file:///test.rosetta'
    );
    // If calculation is a builtin, expect primitive with 'calculation' name
    expect(result.kind).toBe('primitive');
    expect(result.value).toBe('calculation');
  });

  it('short-circuits stdlib aliases in ROSETTA_BASIC_TYPE_NAMES (e.g., calculation → onPrimitive(calculation), not string)', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      typeAlias calculation: string
      type Foo:
        calc calculation (0..1)
    `);
    const data = model.elements.find((e) => isData(e) && e.name === 'Foo') as Data;
    const result = resolveTypeCallTarget(
      findAttrTypeCall(data, 'calc'),
      index,
      recordingVisitor(),
      'file:///test.rosetta'
    );
    // CORRECT behavior: stdlib aliases (calculation, int, productType, eventType —
    // all in ROSETTA_BASIC_TYPE_NAMES) are NOT chased through. They're semantically
    // distinct in emitters and have special handling. The resolver preserves the
    // alias name so emitters can recognize and handle them distinctly (e.g., calculation
    // may have different rendering than plain string).
    expect(result).toEqual({ kind: 'primitive', value: 'calculation' });
  });

  it('chases NON-stdlib aliases (e.g., MyStringAlias → onPrimitive(string))', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      typeAlias MyStringAlias: string
      type Foo:
        field MyStringAlias (0..1)
    `);
    const data = model.elements.find((e) => isData(e) && e.name === 'Foo') as Data;
    const result = resolveTypeCallTarget(
      findAttrTypeCall(data, 'field'),
      index,
      recordingVisitor(),
      'file:///test.rosetta'
    );
    // CORRECT behavior: domain aliases (not in ROSETTA_BASIC_TYPE_NAMES) are chased
    // through to their terminal type. MyStringAlias is a domain-specific alias without
    // special emitter handling, so it resolves to the underlying string type.
    expect(result).toEqual({ kind: 'primitive', value: 'string' });
  });
});
