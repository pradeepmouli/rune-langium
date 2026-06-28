// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { renderNode, renderModel, type RenderChild } from '../../../src/emit/rosetta/rosetta-render-core.js';
const regen: RenderChild = (c) => renderNode(c, regen) ?? '';

describe('renderNode — RosettaTypeAlias', () => {
  it('renders typeAlias name: wrappedType', () => {
    const ta = { $type: 'RosettaTypeAlias', name: 'MyNum', definition: undefined, parameters: [], conditions: [], typeCall: { type: { $refText: 'number' } } } as never;
    expect(renderNode(ta, regen)).toBe('typeAlias MyNum: number');
  });
  it('renders a definition line', () => {
    const ta = { $type: 'RosettaTypeAlias', name: 'X', definition: 'an alias', parameters: [], conditions: [], typeCall: { type: { $refText: 'string' } } } as never;
    expect(renderNode(ta, regen)).toBe('typeAlias X:\n  <"an alias">\n  string');
  });
});

describe('renderModel — QualifiedName support', () => {
  it('renders namespace from a segments-based QualifiedName', () => {
    const result = renderModel({ name: { segments: ['a', 'b'] }, version: '1.0.0', elements: [] });
    expect(result.startsWith('namespace a.b')).toBe(true);
  });
});
