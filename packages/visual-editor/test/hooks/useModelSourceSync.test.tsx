// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Unit tests for useModelSourceSync hook.
 *
 * Core regression: inspector/structure-view edits propagated to the editor-store
 * but never reached the source pane when the Graph pane was not mounted.
 * The source-sync subscription lived inside RuneTypeGraph, which is only mounted
 * when the Graph pane is active. Lifting the subscription into this hook and
 * mounting it unconditionally in EditorPage fixes the dead-pane regression.
 *
 * These tests exercise the hook DIRECTLY via renderHook — no RuneTypeGraph is
 * mounted, proving the sync fires regardless of which visual pane is active.
 *
 * Semantics pinned:
 *   1. Does NOT call onModelChanged on the initial render (skip-initial).
 *   2. Calls onModelChanged when node DATA changes (content edit).
 *   3. Does NOT call onModelChanged on position-only changes (fingerprint guards it).
 *   4. Emitted value is a non-empty Map<string, string> of serialized source text.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { parse } from '@rune-langium/core';
import { useModelSourceSync } from '../../src/hooks/useModelSourceSync.js';
import { useEditorStore } from '../../src/store/editor-store.js';
import { COMBINED_MODEL_SOURCE } from '../helpers/fixture-loader.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadCombinedModel() {
  const result = await parse(COMBINED_MODEL_SOURCE);
  act(() => {
    // Reset in-flight edit patches before loading: the singleton store persists
    // across tests, and a prior test's edit would otherwise be replayed onto this
    // fresh parse (one-shot reconcile), polluting the baseline graph.
    useEditorStore.setState({ pendingEditPatches: [] });
    useEditorStore.getState().selectNode(null);
    useEditorStore.getState().loadModels(result.value);
    useEditorStore.getState().expandAllNamespaces();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useModelSourceSync', () => {
  beforeEach(async () => {
    await loadCombinedModel();
  });

  it('does NOT call onModelChanged on the initial render (skip-initial)', async () => {
    const onModelChanged = vi.fn();
    const nodes = useEditorStore.getState().nodes;
    const edges = useEditorStore.getState().edges;

    renderHook(() => useModelSourceSync(nodes, edges, onModelChanged));

    // Give effects a full microtask + macrotask cycle to run.
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(onModelChanged).not.toHaveBeenCalled();
  });

  it('calls onModelChanged with a non-empty Map when a node attribute changes', async () => {
    const onModelChanged = vi.fn();

    const { rerender } = renderHook(
      ({
        nodes,
        edges
      }: {
        nodes: ReturnType<typeof useEditorStore.getState>['nodes'];
        edges: ReturnType<typeof useEditorStore.getState>['edges'];
      }) => useModelSourceSync(nodes, edges, onModelChanged),
      {
        initialProps: {
          nodes: useEditorStore.getState().nodes,
          edges: useEditorStore.getState().edges
        }
      }
    );

    // Allow initial-skip to settle.
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    onModelChanged.mockClear();

    // Mutate the store (same path taken by inspector/structure edits).
    const tradeNode = useEditorStore.getState().nodes.find((n) => n.data.name === 'Trade')!;
    const productNode = useEditorStore.getState().nodes.find((n) => n.data.name === 'Product')!;

    act(() => {
      useEditorStore.getState().updateAttributeType(tradeNode.id, 'currency', productNode.data.name, productNode.id);
    });

    // Re-render the hook with the new nodes/edges from the store.
    const newNodes = useEditorStore.getState().nodes;
    const newEdges = useEditorStore.getState().edges;
    rerender({ nodes: newNodes, edges: newEdges });

    await waitFor(() => {
      expect(onModelChanged).toHaveBeenCalled();
    });

    const lastCall = onModelChanged.mock.calls.at(-1)!;
    const serialized = lastCall[0] as Map<string, string>;

    // Must be a non-empty Map.
    expect(serialized).toBeInstanceOf(Map);
    expect(serialized.size).toBeGreaterThan(0);

    // The serialized text must reflect the updated attribute type.
    const text = serialized.get('test.combined')!;
    expect(text).toBeDefined();
    expect(text).toMatch(/currency Product\b/);
    expect(text).not.toMatch(/currency CurrencyEnum\b/);
  });

  it('does NOT call onModelChanged when only node position changes', async () => {
    const onModelChanged = vi.fn();

    const { rerender } = renderHook(
      ({
        nodes,
        edges
      }: {
        nodes: ReturnType<typeof useEditorStore.getState>['nodes'];
        edges: ReturnType<typeof useEditorStore.getState>['edges'];
      }) => useModelSourceSync(nodes, edges, onModelChanged),
      {
        initialProps: {
          nodes: useEditorStore.getState().nodes,
          edges: useEditorStore.getState().edges
        }
      }
    );

    // Allow initial-skip to settle.
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    onModelChanged.mockClear();

    // Apply a position-only change — same store action ReactFlow uses on drag.
    const tradeNode = useEditorStore.getState().nodes.find((n) => n.data.name === 'Trade')!;
    act(() => {
      useEditorStore.getState().applyReactFlowNodeChanges([
        {
          type: 'position',
          id: tradeNode.id,
          position: { x: tradeNode.position.x + 100, y: tradeNode.position.y + 50 }
        }
      ]);
    });

    // Re-render with updated nodes.
    const newNodes = useEditorStore.getState().nodes;
    const newEdges = useEditorStore.getState().edges;
    rerender({ nodes: newNodes, edges: newEdges });

    // Give effects a full cycle.
    await new Promise((r) => setTimeout(r, 0));

    expect(onModelChanged).not.toHaveBeenCalled();
  });

  it('does NOT serialize a PARSE-origin change (parseEpoch advanced) — source-corruption guard', async () => {
    // Regression for the source-corruption bug: when the parse worker is
    // unavailable a degraded reparse rebuilds `nodes` (attributes stripped) and
    // bumps `parseEpoch`. Serializing that back to source splices truncated text
    // over the real file. The gate: a content change that arrives WITH a
    // parseEpoch bump came FROM the source (a parse) → must NOT be serialized.
    const onModelChanged = vi.fn();
    const baselineNodes = useEditorStore.getState().nodes;
    const edges = useEditorStore.getState().edges;

    // Produce genuinely different graph content (as a reparse would).
    const tradeNode = baselineNodes.find((n) => n.data.name === 'Trade')!;
    const productNode = baselineNodes.find((n) => n.data.name === 'Product')!;
    act(() => {
      useEditorStore.getState().updateAttributeType(tradeNode.id, 'currency', productNode.data.name, productNode.id);
    });
    const changedNodes = useEditorStore.getState().nodes;

    const { rerender } = renderHook(
      ({ nodes, epoch }: { nodes: typeof baselineNodes; epoch: number }) =>
        useModelSourceSync(nodes, edges, onModelChanged, epoch),
      { initialProps: { nodes: baselineNodes, epoch: 0 } }
    );
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    onModelChanged.mockClear();

    // Content differs AND parseEpoch advanced → parse-origin → no serialize.
    rerender({ nodes: changedNodes, epoch: 1 });
    await new Promise((r) => setTimeout(r, 0));
    expect(onModelChanged).not.toHaveBeenCalled();
  });

  it('DOES serialize a USER-origin change (same content change, parseEpoch unchanged)', async () => {
    // Control for the gate above: the SAME content change WITHOUT a parseEpoch
    // bump is a user edit and MUST still serialize — proving the gate keys on
    // parse-origin, not on the change itself (and doesn't break normal edits,
    // including deletions which are also user edits).
    const onModelChanged = vi.fn();
    const baselineNodes = useEditorStore.getState().nodes;
    const edges = useEditorStore.getState().edges;

    const tradeNode = baselineNodes.find((n) => n.data.name === 'Trade')!;
    const productNode = baselineNodes.find((n) => n.data.name === 'Product')!;
    act(() => {
      useEditorStore.getState().updateAttributeType(tradeNode.id, 'currency', productNode.data.name, productNode.id);
    });
    const changedNodes = useEditorStore.getState().nodes;

    const { rerender } = renderHook(
      ({ nodes, epoch }: { nodes: typeof baselineNodes; epoch: number }) =>
        useModelSourceSync(nodes, edges, onModelChanged, epoch),
      { initialProps: { nodes: baselineNodes, epoch: 7 } }
    );
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    onModelChanged.mockClear();

    // Content differs, parseEpoch UNCHANGED (7) → user-origin → serialize fires.
    rerender({ nodes: changedNodes, epoch: 7 });
    await waitFor(() => {
      expect(onModelChanged).toHaveBeenCalled();
    });
  });

  it('does NOT serialize deferred placeholder nodes (curated stubs the user did not author)', async () => {
    // Deferred-export placeholders (`meta.deferred === true`) are `{ $type, name }`
    // stubs for namespaces the user did NOT author. Serializing them emits stub
    // elements into source files the user never wrote — modelsToAst filters them
    // at the serialization boundary; this pins that end-to-end through the
    // hook's emission path.
    const onModelChanged = vi.fn();
    const deferredStub = {
      id: 'other.curated.Stub',
      type: 'data',
      position: { x: 0, y: 0 },
      data: { $type: 'Data', name: 'Stub' },
      meta: { namespace: 'other.curated', errors: [], hasExternalRefs: false, deferred: true }
    } as unknown as ReturnType<typeof useEditorStore.getState>['nodes'][number];

    const baselineNodes = [...useEditorStore.getState().nodes, deferredStub];
    const edges = useEditorStore.getState().edges;

    const { rerender } = renderHook(
      ({ nodes }: { nodes: typeof baselineNodes }) => useModelSourceSync(nodes, edges, onModelChanged),
      { initialProps: { nodes: baselineNodes } }
    );

    // Allow initial-skip to settle.
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    onModelChanged.mockClear();

    // User edit (same path as inspector/structure edits).
    const tradeNode = useEditorStore.getState().nodes.find((n) => n.data.name === 'Trade')!;
    const productNode = useEditorStore.getState().nodes.find((n) => n.data.name === 'Product')!;
    act(() => {
      useEditorStore.getState().updateAttributeType(tradeNode.id, 'currency', productNode.data.name, productNode.id);
    });

    rerender({ nodes: [...useEditorStore.getState().nodes, deferredStub] });

    await waitFor(() => {
      expect(onModelChanged).toHaveBeenCalled();
    });

    const serialized = onModelChanged.mock.calls.at(-1)![0] as Map<string, string>;
    // The user-authored namespace serializes; the deferred stub's namespace must NOT.
    expect(serialized.has('test.combined')).toBe(true);
    expect(serialized.has('other.curated')).toBe(false);
  });

  it('does NOT call onModelChanged when onModelChanged is undefined', async () => {
    // Should not throw, should be a no-op.
    const nodes = useEditorStore.getState().nodes;
    const edges = useEditorStore.getState().edges;

    expect(() => {
      renderHook(() => useModelSourceSync(nodes, edges, undefined));
    }).not.toThrow();
  });
});
