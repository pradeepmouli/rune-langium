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
