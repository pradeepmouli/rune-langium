// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Regression — inspector / structure-view edits propagate to source pane.
 *
 * 2026-05-20 prod-smoke check, Defect B: attribute edits in the inspector
 * and structure view landed in the editor-store but never propagated to
 * the CodeMirror source pane.
 *
 * Two broken links were identified:
 *
 *   1. `RuneTypeGraph.exportRosetta()` emitted a single-line comment
 *      placeholder (`// namespace (N elements)`) instead of running the
 *      real serializer from `@rune-langium/core`.
 *   2. `onModelChanged` only fired when callers imperatively invoked
 *      `ref.exportRosetta()` — there was no store subscription that
 *      pushed graph-state changes back to the source files.
 *
 * These tests pin both behaviours:
 *
 *   - `exportRosetta()` returns parseable `.rosetta` text reflecting
 *     the current store state.
 *   - Store mutations (inspector + structure-view actions both route
 *     through the editor-store) automatically trigger `onModelChanged`
 *     with serialised text — no imperative call required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import { parse } from '@rune-langium/core';
import { RuneTypeGraph } from '../../src/components/RuneTypeGraph.js';
import { useEditorStore } from '../../src/store/editor-store.js';
import type { RuneTypeGraphRef } from '../../src/types.js';
import { COMBINED_MODEL_SOURCE } from '../helpers/fixture-loader.js';

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react');
  return {
    ...actual,
    useReactFlow: () => ({
      fitView: vi.fn(async () => true),
      setCenter: vi.fn(),
      setViewport: vi.fn(async () => true)
    })
  };
});

async function loadCombinedModel() {
  const result = await parse(COMBINED_MODEL_SOURCE);
  act(() => {
    // Reset selection so prior tests don't bleed in via the singleton store.
    useEditorStore.getState().selectNode(null);
    useEditorStore.getState().loadModels(result.value);
    useEditorStore.getState().expandAllNamespaces();
  });
}

beforeEach(() => {
  cleanup();
});

describe('Inspector/structure edits -> source pane sync (Defect B)', () => {
  it('exportRosetta() returns real serialised source text, not a placeholder', async () => {
    const ref = createRef<RuneTypeGraphRef>();
    await loadCombinedModel();
    render(<RuneTypeGraph ref={ref} />);

    const out = ref.current!.exportRosetta();
    const text = out.get('test.combined');
    expect(text).toBeDefined();
    // Real serialised output starts with the namespace declaration and
    // includes the type names. The bug emitted only `// ${namespace} (...)`.
    expect(text).toMatch(/^namespace test\.combined/);
    expect(text).not.toMatch(/^\/\/ test\.combined/);
    expect(text).toContain('type Trade:');
    expect(text).toContain('type Product:');
  });

  it('fires onModelChanged automatically when an attribute type is changed', async () => {
    const onModelChanged = vi.fn();
    await loadCombinedModel();
    render(<RuneTypeGraph callbacks={{ onModelChanged }} />);

    // Allow the initial-skip effect to record the baseline serialisation.
    await waitFor(() => {
      expect(true).toBe(true);
    });

    onModelChanged.mockClear();

    // Inspector and structure-view edits both route through the same store
    // action. Trigger the underlying mutation.
    const tradeNode = useEditorStore.getState().nodes.find((n) => n.data.name === 'Trade')!;
    const productNode = useEditorStore.getState().nodes.find((n) => n.data.name === 'Product')!;

    act(() => {
      useEditorStore
        .getState()
        .updateAttributeType(tradeNode.id, 'currency', productNode.data.name, productNode.id);
    });

    await waitFor(() => {
      expect(onModelChanged).toHaveBeenCalled();
    });

    const lastCall = onModelChanged.mock.calls.at(-1)!;
    const serialized = lastCall[0] as Map<string, string>;
    const text = serialized.get('test.combined')!;

    // The updated source should now reflect `currency Product` instead of
    // `currency CurrencyEnum`. Match flexibly because cardinality formatting
    // is independent of the bug we're guarding.
    expect(text).toMatch(/currency Product\b/);
    expect(text).not.toMatch(/currency CurrencyEnum\b/);
  });

  it('fires onModelChanged automatically when an attribute is renamed', async () => {
    const onModelChanged = vi.fn();
    await loadCombinedModel();
    render(<RuneTypeGraph callbacks={{ onModelChanged }} />);

    onModelChanged.mockClear();

    const tradeNode = useEditorStore.getState().nodes.find((n) => n.data.name === 'Trade')!;

    act(() => {
      useEditorStore.getState().renameAttribute(tradeNode.id, 'tradeDate', 'executionDate');
    });

    await waitFor(() => {
      expect(onModelChanged).toHaveBeenCalled();
    });

    const serialized = onModelChanged.mock.calls.at(-1)![0] as Map<string, string>;
    const text = serialized.get('test.combined')!;
    expect(text).toMatch(/\bexecutionDate\b/);
    expect(text).not.toMatch(/\btradeDate\b/);
  });

  it('does not re-emit onModelChanged when nothing in the model has changed', async () => {
    const onModelChanged = vi.fn();
    await loadCombinedModel();
    const { rerender } = render(<RuneTypeGraph callbacks={{ onModelChanged }} />);

    // Allow the initial mount to complete.
    await waitFor(() => {
      expect(true).toBe(true);
    });

    onModelChanged.mockClear();

    // Rerender with the exact same props - no store mutation, no source change.
    rerender(<RuneTypeGraph callbacks={{ onModelChanged }} />);

    // Give effects a chance to run.
    await new Promise((r) => setTimeout(r, 0));

    expect(onModelChanged).not.toHaveBeenCalled();
  });
});
