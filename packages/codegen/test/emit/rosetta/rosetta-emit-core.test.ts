// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { renderNode, type RenderChild } from '../../../src/emit/rosetta/rosetta-render-core.js';

// Child policy for tests: always regenerate; throw if a child is unimplemented
// (the tests below only use implemented children).
const regen: RenderChild = (c) => {
  const t = renderNode(c, regen);
  if (t === null) throw new Error(`unimplemented child ${(c as { $type: string }).$type}`);
  return t;
};

describe('renderNode — implemented scalars', () => {
  it('emits a Data header with extends and definition', () => {
    const node = {
      $type: 'Data',
      name: 'Foo',
      superType: { $refText: 'Bar' },
      definition: 'a foo',
      annotations: [],
      references: [],
      synonyms: [],
      conditions: [],
      attributes: [
        {
          $type: 'Attribute',
          name: 'bar',
          override: false,
          typeCall: { type: { $refText: 'string' } },
          card: { $type: 'RosettaCardinality', inf: 0, sup: 1, unbounded: false },
          annotations: [], references: [], synonyms: [], labels: [],
          ruleReferences: [], typeCallArgs: []
        }
      ]
    } as never;

    expect(renderNode(node, regen)).toBe(
      'type Foo extends Bar:\n' +
      '  <"a foo">\n' +
      '  bar string (0..1)'
    );
  });

  it('emits an unbounded cardinality as (n..*)', () => {
    const attr = {
      $type: 'Attribute', name: 'xs', override: false,
      typeCall: { type: { $refText: 'string' } },
      card: { $type: 'RosettaCardinality', inf: 1, sup: undefined, unbounded: true },
      annotations: [], references: [], synonyms: [], labels: [],
      ruleReferences: [], typeCallArgs: []
    } as never;
    expect(renderNode(attr, regen)).toBe('xs string (1..*)');
  });

  it('emits override and a missing definition', () => {
    const attr = {
      $type: 'Attribute', name: 'y', override: true,
      typeCall: { type: { $refText: 'int' } },
      card: { $type: 'RosettaCardinality', inf: 0, sup: 0, unbounded: false },
      annotations: [], references: [], synonyms: [], labels: [],
      ruleReferences: [], typeCallArgs: []
    } as never;
    expect(renderNode(attr, regen)).toBe('override y int (0..0)');
  });

  it('emits a choice with options', () => {
    const node = {
      $type: 'Choice', name: 'Pick', annotations: [], synonyms: [],
      attributes: [
        { $type: 'ChoiceOption', typeCall: { type: { $refText: 'A' } }, annotations: [], references: [], synonyms: [], labels: [], ruleReferences: [] },
        { $type: 'ChoiceOption', typeCall: { type: { $refText: 'B' } }, annotations: [], references: [], synonyms: [], labels: [], ruleReferences: [] }
      ]
    } as never;
    expect(renderNode(node, regen)).toBe('choice Pick:\n  A\n  B');
  });

  it('emits an enum with extends, displayName and values', () => {
    const node = {
      $type: 'RosettaEnumeration', name: 'Color',
      parent: { $refText: 'BaseColor' }, definition: undefined,
      annotations: [], references: [], synonyms: [],
      enumValues: [
        { $type: 'RosettaEnumValue', name: 'RED', display: 'Red', definition: undefined, annotations: [], references: [], enumSynonyms: [] },
        { $type: 'RosettaEnumValue', name: 'GREEN', display: undefined, definition: undefined, annotations: [], references: [], enumSynonyms: [] }
      ]
    } as never;
    expect(renderNode(node, regen)).toBe(
      'enum Color extends BaseColor:\n' +
      '  RED displayName "Red"\n' +
      '  GREEN'
    );
  });

  it('renders a minimal RosettaFunction with no children', () => {
    const fn = { $type: 'RosettaFunction', name: 'DoIt' } as never;
    expect(renderNode(fn, regen)).toBe('func DoIt:');
  });
});
