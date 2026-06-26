// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { curatedAdapter } from '../../src/adapters/curated-adapter.js';
import type { Data } from '../../src/generated/ast.js';

describe('curatedAdapter', () => {
  it('parse casts JSON with $type and $namespace to Dehydrated<T>', () => {
    const json = {
      $type: 'Data',
      $namespace: 'rosetta.base.staticnode',
      name: { $type: 'ValidID', value: 'Foo' },
      attributes: []
    };
    const result = curatedAdapter.parse<Data>(json);
    expect(result.$type).toBe('Data');
    expect(result.$namespace).toBe('rosetta.base.staticnode');
  });

  it('parse is a safe cast — does not throw on well-formed input', () => {
    expect(() => curatedAdapter.parse({ $type: 'Choice', attributes: [] })).not.toThrow();
  });
});
