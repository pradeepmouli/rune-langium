// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * P2 expression-fidelity tests (Task 3 of the P2 design).
 *
 * Scenario under test: a node goes dirty for a NON-expression reason (a
 * sibling-field edit — here, renaming a condition via `updateCondition`'s
 * `name` field). The whole node re-renders, which re-renders every child
 * including the condition itself (dirty, since its `name` field changed),
 * and the condition's body goes through `renderCondition` -> `exprText`.
 *
 * Before this fix, `exprText` fell through to structural `renderExpression`
 * for that untouched body, dropping comments and collapsing multi-line
 * layout to a single line (see the P2 design doc, "Problem"). After this
 * fix, `cst-reuse-renderer` supplies a `renderExpr` hook that slices the
 * ORIGINAL source bytes for any expression whose `$cstRange` is still
 * present and clean — byte-identical output, comments and layout intact.
 */

import { describe, it, expect } from 'vitest';
import { parse, parsedAdapter } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import { buildSourceForNamespaces } from '../../src/hooks/useModelSourceSync.js';
import { renderNamespace } from '../../src/serialize/cst-reuse-renderer.js';
import { buildDirtyIndex } from '../../src/serialize/dirty-paths.js';
import type { Patches } from 'mutative';
import type { TypeGraphNode } from '../../src/types.js';

// A multi-line condition body with an inline `//` comment. Neither the
// comment nor the line break is representable in the AST — both are
// CST-only and must survive via range-slicing, not structural rendering.
const SRC = `namespace test
version "1.0.0"

type Foo:
  bar string (1..1)
  baz int (0..1)

  condition C1:
    if bar exists
      // comment explaining why baz matters here
      then baz exists
`;

describe('cst-reuse expression fidelity (P2 Task 3)', () => {
  it('1. slices an unedited multi-line commented condition body byte-identical when a sibling field dirties the node', async () => {
    const { value, hasErrors } = await parse(SRC);
    expect(hasErrors).toBe(false);
    const store = createEditorStore();
    store.getState().loadModels(value);

    const foo = store.getState().nodes.find((n) => n.data.name === 'Foo');
    expect(foo).toBeDefined();

    // Sibling-field edit: rename the condition itself (the `name` field),
    // NOT its expression. This dirties the condition subtree (so it goes
    // through renderNode -> renderCondition) while its `expression` field
    // keeps its original $cstRange untouched.
    store.getState().updateCondition(foo!.id, 0, { name: 'Renamed' });

    const sourceMap = buildSourceForNamespaces({
      nodes: store.getState().nodes,
      edges: store.getState().edges,
      originalSourceByNamespace: new Map([['test', SRC]]),
      patches: store.getState().pendingEditPatches,
      inversePatches: store.getState().pendingInversePatches
    });
    const out = sourceMap.get('test');
    expect(out).toBeTruthy();

    // The rename applied.
    expect(out).toContain('condition Renamed:');
    // The body is BYTE-IDENTICAL to the original: comment + line breaks survive.
    expect(out).toContain('if bar exists\n      // comment explaining why baz matters here\n      then baz exists');

    // Re-parse succeeds.
    const re = await parse(out!);
    expect(re.hasErrors).toBe(false);
  });

  it('2. replacing the body via updateCondition (RawDsl) serializes the new text verbatim', async () => {
    const { value } = await parse(SRC);
    const store = createEditorStore();
    store.getState().loadModels(value);

    const foo = store.getState().nodes.find((n) => n.data.name === 'Foo');
    expect(foo).toBeDefined();

    store.getState().updateCondition(foo!.id, 0, { expressionText: 'bar is absent' });

    const sourceMap = buildSourceForNamespaces({
      nodes: store.getState().nodes,
      edges: store.getState().edges,
      originalSourceByNamespace: new Map([['test', SRC]]),
      patches: store.getState().pendingEditPatches,
      inversePatches: store.getState().pendingInversePatches
    });
    const out = sourceMap.get('test');
    expect(out).toBeTruthy();

    expect(out).toContain('bar is absent');
    // The old body (including the comment) is gone.
    expect(out).not.toContain('comment explaining why baz matters here');
    expect(out).not.toContain('baz exists');

    const re = await parse(out!);
    expect(re.hasErrors).toBe(false);
  });

  it('3. a rangeless structural expression body falls back to structural rendering without throwing', async () => {
    const { value } = await parse(SRC);
    const data = (value as unknown as { elements: unknown[] }).elements[0];
    const dehydrated = parsedAdapter.dehydrate(data as Parameters<typeof parsedAdapter.dehydrate>[0]);

    // Hand-inject a structured (non-RawDsl) expression body with NO $cstRange
    // onto the condition — simulates a programmatically-constructed node that
    // never had source bytes to slice.
    const dd = dehydrated as unknown as {
      conditions: Array<{ expression: unknown; $cstRange?: unknown }>;
    };
    dd.conditions[0]!.expression = {
      $type: 'LogicalOperation',
      operator: 'and',
      // rawArgs: [] — []-canonical convention (parser always materializes an
      // array, never omits it); required by RosettaSymbolReferenceSchema.
      left: { $type: 'RosettaSymbolReference', symbol: { $refText: 'bar' }, rawArgs: [] },
      right: { $type: 'RosettaSymbolReference', symbol: { $refText: 'baz' }, rawArgs: [] }
      // no $cstRange
    };

    const nodeId = 'test.Foo';
    const node = {
      id: nodeId,
      data: dehydrated,
      meta: { namespace: 'test', deferred: false }
    } as unknown as TypeGraphNode;

    // Dirty the condition subtree so it regenerates through renderCondition.
    const patches = [
      { op: 'replace', path: ['nodes', nodeId, 'data', 'conditions', 0, 'name'], value: 'C1' }
    ] as unknown as Patches;

    let out: string | undefined;
    expect(() => {
      out = renderNamespace({ nodes: [node], originalSource: SRC, dirty: buildDirtyIndex(patches) });
    }).not.toThrow();

    expect(out).toBeTruthy();
    // Structural rendering of the injected AND expression is present (no throw,
    // no crash-to-empty); exact structural text is `bar and baz`.
    expect(out).toContain('bar and baz');
  });
});
