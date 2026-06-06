// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { makeNodeId, nameFromNodeId, splitNodeId } from '../../src/store/node-projection.js';

describe('node-projection id builders (V1)', () => {
  it('makeNodeId joins namespace and name with the :: separator', () => {
    expect(makeNodeId('cdm.base', 'Foo')).toBe('cdm.base::Foo');
  });
  it('nameFromNodeId returns the trailing name', () => {
    expect(nameFromNodeId('cdm.base::Foo')).toBe('Foo');
    expect(nameFromNodeId('Foo')).toBe('Foo'); // no separator → whole string
  });
  it('splitNodeId returns namespace + name', () => {
    expect(splitNodeId('cdm.base::Foo')).toEqual({ namespace: 'cdm.base', name: 'Foo' });
    expect(splitNodeId('Foo')).toEqual({ namespace: '', name: 'Foo' });
  });
});
