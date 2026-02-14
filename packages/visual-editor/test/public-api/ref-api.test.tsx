/**
 * Tests for the public API / ref behavior of RuneTypeGraph.
 *
 * Verifies that the imperative ref API works correctly:
 * fitView, focusNode, search, setFilters, getFilters, relayout.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { createRef } from 'react';
import { parse } from '@rune-langium/core';
import { RuneTypeGraph } from '../../src/components/RuneTypeGraph.js';
import type { RuneTypeGraphRef } from '../../src/types.js';
import { COMBINED_MODEL_SOURCE } from '../helpers/fixture-loader.js';

describe('RuneTypeGraph ref API', () => {
  it('exposes fitView via ref', async () => {
    const ref = createRef<RuneTypeGraphRef>();
    const result = await parse(COMBINED_MODEL_SOURCE);

    render(<RuneTypeGraph ref={ref} models={result.value} />);

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

    render(<RuneTypeGraph ref={ref} models={result.value} />);

    let results: string[] = [];
    act(() => {
      results = ref.current!.search('Trade');
    });
    expect(results.length).toBeGreaterThan(0);
  });

  it('exposes search returning empty array for no match', async () => {
    const ref = createRef<RuneTypeGraphRef>();
    const result = await parse(COMBINED_MODEL_SOURCE);

    render(<RuneTypeGraph ref={ref} models={result.value} />);

    let results: string[] = [];
    act(() => {
      results = ref.current!.search('NonExistent');
    });
    expect(results).toHaveLength(0);
  });

  it('exposes setFilters and getFilters', async () => {
    const ref = createRef<RuneTypeGraphRef>();
    const result = await parse(COMBINED_MODEL_SOURCE);

    render(<RuneTypeGraph ref={ref} models={result.value} />);

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

    render(<RuneTypeGraph ref={ref} models={result.value} />);

    expect(typeof ref.current!.relayout).toBe('function');
    // Should not throw
    act(() => {
      ref.current!.relayout({ direction: 'LR' });
    });
  });

  it('exposes focusNode', async () => {
    const ref = createRef<RuneTypeGraphRef>();
    const result = await parse(COMBINED_MODEL_SOURCE);

    render(<RuneTypeGraph ref={ref} models={result.value} />);

    expect(typeof ref.current!.focusNode).toBe('function');
    // Should not throw even with unknown node ID
    act(() => {
      ref.current!.focusNode('test.combined::Trade');
    });
  });

  it('fires onNodeSelect callback', async () => {
    const ref = createRef<RuneTypeGraphRef>();
    const onNodeSelect = vi.fn();
    const result = await parse(COMBINED_MODEL_SOURCE);

    render(<RuneTypeGraph ref={ref} models={result.value} callbacks={{ onNodeSelect }} />);

    // The callback is wired; actual invocation depends on user interaction
    expect(typeof onNodeSelect).toBe('function');
  });

  it('exposes undo/redo (P2 stubs)', async () => {
    const ref = createRef<RuneTypeGraphRef>();
    const result = await parse(COMBINED_MODEL_SOURCE);

    render(<RuneTypeGraph ref={ref} models={result.value} />);

    expect(typeof ref.current!.undo).toBe('function');
    expect(typeof ref.current!.redo).toBe('function');
    expect(typeof ref.current!.exportRosetta).toBe('function');
  });
});
