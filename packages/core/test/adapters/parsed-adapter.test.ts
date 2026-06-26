// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { parsedAdapter } from '../../src/adapters/parsed-adapter.js';
import type { Data } from '../../src/generated/ast.js';

function makeFakeData(): Data {
  return {
    $type: 'Data',
    attributes: [],
    $container: {
      $type: 'RosettaModel',
      name: 'test.namespace'
    } as any,
    $containerProperty: 'elements',
    $containerIndex: 0,
    $cstNode: undefined as any,
    $document: undefined as any
  } as unknown as Data;
}

describe('parsedAdapter', () => {
  it('dehydrate is a function', () => {
    expect(typeof parsedAdapter.dehydrate).toBe('function');
  });

  it('dehydrate returns an object with $type', () => {
    const node = makeFakeData();
    const result = parsedAdapter.dehydrate(node);
    expect(result.$type).toBe('Data');
  });

  it('dehydrate stamps $namespace from containing RosettaModel', () => {
    const node = makeFakeData();
    const result = parsedAdapter.dehydrate(node);
    expect(result.$namespace).toBe('test.namespace');
  });
});
