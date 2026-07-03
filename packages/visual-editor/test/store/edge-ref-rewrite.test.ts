// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import { renameRefValue, rewriteEdgeRefInNode } from '../../src/store/edge-ref-rewrite.js';
import {
  SIMPLE_INHERITANCE_SOURCE,
  ENUM_INHERITANCE_SOURCE,
  CHOICE_MODEL_SOURCE,
  COMBINED_MODEL_SOURCE
} from '../helpers/fixture-loader.js';

describe('renameRefValue (form-preserving)', () => {
  it('bare stays bare, qualified stays qualified, non-matching returns null', () => {
    expect(renameRefValue('Foo', 'Foo', 'Bar', 'ns')).toBe('Bar');
    expect(renameRefValue('ns.Foo', 'Foo', 'Bar', 'ns')).toBe('ns.Bar');
    expect(renameRefValue('other.Foo', 'Foo', 'Bar', 'ns')).toBeNull();
    expect(renameRefValue('Fool', 'Foo', 'Bar', 'ns')).toBeNull();
    expect(renameRefValue(undefined, 'Foo', 'Bar', 'ns')).toBeNull();
  });
});

describe('edge → slot invariant (every materialized edge locates a rewritable slot)', () => {
  // Spec §Testing: the loud-drift guard for recipe-created edges (§6).
  // ENUM_INHERITANCE_SOURCE (enum extends enum) exercises the `enum-extends`
  // switch arm in rewriteEdgeRefInNode — otherwise untested by this loop,
  // since no other fixture here produces that edge kind.
  for (const [name, source] of [
    ['inheritance', SIMPLE_INHERITANCE_SOURCE],
    ['enum-inheritance', ENUM_INHERITANCE_SOURCE],
    ['choice', CHOICE_MODEL_SOURCE],
    ['combined', COMBINED_MODEL_SOURCE]
  ] as const) {
    it(`${name} fixture: rewriteEdgeRefInNode locates every edge's slot`, async () => {
      const store = createEditorStore();
      store.getState().loadModels((await parse(source)).value);
      const { nodesById, edgesById } = store.getState();
      expect(edgesById.size).toBeGreaterThan(0);
      for (const edge of edgesById.values()) {
        const src = nodesById.get(edge.source)!;
        const target = nodesById.get(edge.target)!;
        const oldName = target.data.name!;
        const ns = target.meta.namespace;
        // Rewriting to a sentinel must succeed (non-null) for EVERY edge:
        // the slot exists and its $refText matches bare or qualified form.
        const rewritten = rewriteEdgeRefInNode(edge, src.data, oldName, '__SENTINEL__', ns);
        expect(rewritten, `edge ${edge.id} failed to locate/match its slot`).not.toBeNull();
        // And the rewrite is FORM-PRESERVING: sentinel appears bare or ns-qualified, never mixed.
        const json = JSON.stringify(rewritten);
        expect(json.includes('__SENTINEL__')).toBe(true);
      }
    });
  }
});

describe('rewriteEdgeRefInNode returns null on invariant breach', () => {
  it('unlocatable slot (label names a missing member) → null, no throw', async () => {
    const store = createEditorStore();
    store.getState().loadModels((await parse(SIMPLE_INHERITANCE_SOURCE)).value);
    const { nodesById, edgesById } = store.getState();
    const edge = [...edgesById.values()].find((e) => e.data?.kind === 'attribute-ref')!;
    const src = nodesById.get(edge.source)!;
    const bogusEdge = { ...edge, data: { ...edge.data!, label: 'no-such-member' } };
    expect(rewriteEdgeRefInNode(bogusEdge, src.data, 'X', 'Y', 'ns')).toBeNull();
  });
});

describe('choice-option arm rewrites ALL matching options (PR #368 Copilot finding)', () => {
  // Duplicate options for the same type share ONE edge (identical
  // source/target/label), so the cascade reaches this arm exactly once —
  // a first-match rewrite would leave sibling duplicates stale. The store
  // explicitly tolerates duplicates (removeChoiceOption drains them).
  it('bare + qualified duplicates are all rewritten in one pass; non-matching options untouched', () => {
    const choiceData = {
      $type: 'Choice',
      name: 'MyChoice',
      attributes: [
        { name: 'a', typeCall: { type: { $refText: 'Target' } } },
        { name: 'b', typeCall: { type: { $refText: 'other.Thing' } } },
        { name: 'c', typeCall: { type: { $refText: 'ns.Target' } } }
      ]
    } as never;
    const edge = {
      id: 'e',
      source: 's',
      target: 't',
      data: { kind: 'choice-option', label: 'Target' }
    } as never;
    const out = rewriteEdgeRefInNode(edge, choiceData, 'Target', 'Renamed', 'ns') as {
      attributes: { typeCall: { type: { $refText: string } } }[];
    } | null;
    expect(out).not.toBeNull();
    expect(out!.attributes.map((o) => o.typeCall.type.$refText)).toEqual(['Renamed', 'other.Thing', 'ns.Renamed']);
  });
});
