/**
 * Tests for the public API / ref behavior of RuneTypeGraph.
 *
 * Verifies that the imperative ref API works correctly:
 * fitView, focusNode, search, setFilters, getFilters, relayout.
 *
 * Models are loaded into the zustand editor store (source of truth),
 * not passed as props. The graph subscribes to the store.
 */

import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { createRef } from 'react';
import { parse } from '@rune-langium/core';
import { RuneTypeGraph } from '../../src/components/RuneTypeGraph.js';
import { useEditorStore } from '../../src/store/editor-store.js';
import type { RuneTypeGraphRef } from '../../src/types.js';
import { COMBINED_MODEL_SOURCE } from '../helpers/fixture-loader.js';

/** Load models into the store before rendering the graph. */
function loadModelsIntoStore(models: unknown) {
  act(() => {
    useEditorStore.getState().loadModels(models);
    // Expand all namespaces so nodes are visible
    useEditorStore.getState().expandAllNamespaces();
  });
}

describe('RuneTypeGraph ref API', () => {
  it('exposes fitView via ref', async () => {
    const ref = createRef<RuneTypeGraphRef>();
    const result = await parse(COMBINED_MODEL_SOURCE);
    loadModelsIntoStore(result.value);

    render(<RuneTypeGraph ref={ref} />);

    expect(ref.current).toBeDefined();
    expect(typeof ref.current!.fitView).toBe('function');
    // Should not throw
    act(() => {
      ref.current!.fitView();
    });
  });

  it('exposes search via ref', async () => {
    const ref = createRef<RuneTypeGraphRef>();
    const result = await parse(COMBINED_MODEL_SOURCE);
    loadModelsIntoStore(result.value);

    render(<RuneTypeGraph ref={ref} />);

    let results: string[] = [];
    act(() => {
      results = ref.current!.search('Trade');
    });
    expect(results.length).toBeGreaterThan(0);
  });

  it('exposes search returning empty array for no match', async () => {
    const ref = createRef<RuneTypeGraphRef>();
    const result = await parse(COMBINED_MODEL_SOURCE);
    loadModelsIntoStore(result.value);

    render(<RuneTypeGraph ref={ref} />);

    let results: string[] = [];
    act(() => {
      results = ref.current!.search('NonExistent');
    });
    expect(results).toHaveLength(0);
  });

  it('exposes setFilters and getFilters', async () => {
    const ref = createRef<RuneTypeGraphRef>();
    const result = await parse(COMBINED_MODEL_SOURCE);
    loadModelsIntoStore(result.value);

    render(<RuneTypeGraph ref={ref} />);

    act(() => {
      ref.current!.setFilters({ kinds: ['data'], hideOrphans: true });
    });

    const filters = ref.current!.getFilters();
    expect(filters.kinds).toEqual(['data']);
    expect(filters.hideOrphans).toBe(true);
  });

  it('exposes relayout', async () => {
    const ref = createRef<RuneTypeGraphRef>();
    const result = await parse(COMBINED_MODEL_SOURCE);
    loadModelsIntoStore(result.value);

    render(<RuneTypeGraph ref={ref} />);

    expect(typeof ref.current!.relayout).toBe('function');
    // Should not throw
    act(() => {
      ref.current!.relayout({ direction: 'LR' });
    });
  });

  it('exposes focusNode', async () => {
    const ref = createRef<RuneTypeGraphRef>();
    const result = await parse(COMBINED_MODEL_SOURCE);
    loadModelsIntoStore(result.value);

    render(<RuneTypeGraph ref={ref} />);

    expect(typeof ref.current!.focusNode).toBe('function');
    // Should not throw even with unknown node ID
    act(() => {
      ref.current!.focusNode('test.combined::Trade');
    });
  });

  it('selection goes through the store', async () => {
    const result = await parse(COMBINED_MODEL_SOURCE);
    loadModelsIntoStore(result.value);

    render(<RuneTypeGraph />);

    // Selection is managed by store, not by callbacks
    const store = useEditorStore.getState();
    expect(store.selectedNodeId).toBeNull();
    act(() => {
      store.selectNode('test.combined::Trade');
    });
    expect(useEditorStore.getState().selectedNodeId).toBe('test.combined::Trade');
  });

  it('exposes exportRosetta and validate on ref', async () => {
    const ref = createRef<RuneTypeGraphRef>();
    const result = await parse(COMBINED_MODEL_SOURCE);
    loadModelsIntoStore(result.value);

    render(<RuneTypeGraph ref={ref} />);

    expect(typeof ref.current!.exportRosetta).toBe('function');
    expect(typeof ref.current!.validate).toBe('function');
  });
});
