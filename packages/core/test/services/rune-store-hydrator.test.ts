// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import type { Data, RosettaModel } from '../../src/generated/ast.js';
import { RuneStoreHydrator } from '../../src/services/rune-store-hydrator.js';

const minimalServices = {
  Grammar: {},
  parser: { Lexer: {} },
  references: { Linker: {} },
} as any;

function makeDataInNamespace(namespace: string): Data {
  const model = {
    $type: 'RosettaModel',
    name: namespace,
    $container: undefined,
  } as unknown as RosettaModel;

  return {
    $type: 'Data',
    name: { $type: 'ValidID', value: 'MyData' },
    attributes: [],
    $container: model,
    $containerProperty: 'elements',
    $containerIndex: 0,
    $cstNode: undefined,
    $document: undefined,
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
      $refNode: {},
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
      $container: undefined,
    } as unknown as Data;
    const dehydrated = hydrator.dehydrateNode(data);
    expect(dehydrated.$namespace).toBeUndefined();
  });
});
