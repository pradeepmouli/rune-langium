// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { renderNode, type RenderChild } from '../../../src/emit/rosetta/rosetta-render-core.js';
const regen: RenderChild = (c) => renderNode(c, regen) ?? '';

describe('renderNode — annotations & synonyms', () => {
  it('renders an annotation ref (annotation + attribute)', () => {
    const a = { $type: 'AnnotationRef', annotation: { $refText: 'metadata' }, attribute: { $refText: 'scheme' }, qualifiers: [] } as never;
    expect(renderNode(a, regen)).toBe('[metadata scheme]');
  });
  it('renders an annotation ref (annotation only)', () => {
    const a = { $type: 'AnnotationRef', annotation: { $refText: 'rootType' }, attribute: undefined, qualifiers: [] } as never;
    expect(renderNode(a, regen)).toBe('[rootType]');
  });
  it('renders a class synonym (the inspector-produced source shape)', () => {
    const s = { $type: 'RosettaClassSynonym', sources: [{ $refText: 'FpML' }], value: undefined, metaValue: undefined } as never;
    expect(renderNode(s, regen)).toBe('[synonym FpML]');
  });
});
