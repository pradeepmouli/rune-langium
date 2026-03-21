// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Smoke test for RuneTypeGraph component rendering.
 *
 * Models are loaded into the zustand editor store (source of truth).
 * The graph component subscribes to the store — no `models` prop.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { act } from '@testing-library/react';
import { parse } from '@rune-langium/core';
import { RuneTypeGraph } from '../../src/components/RuneTypeGraph.js';
import { useEditorStore } from '../../src/store/editor-store.js';
import { SIMPLE_INHERITANCE_SOURCE, COMBINED_MODEL_SOURCE } from '../helpers/fixture-loader.js';

function loadModels(models: unknown) {
  act(() => {
    useEditorStore.getState().loadModels(models);
  });
}

describe('RuneTypeGraph', () => {
  it('renders without crashing with a simple model', async () => {
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    loadModels(result.value);
    const { container } = render(<RuneTypeGraph />);

    expect(container.querySelector('.rune-type-graph')).toBeTruthy();
  });

  it('renders without crashing with a combined model', async () => {
    const result = await parse(COMBINED_MODEL_SOURCE);
    loadModels(result.value);
    const { container } = render(<RuneTypeGraph />);

    expect(container.querySelector('.rune-type-graph')).toBeTruthy();
  });

  it('renders with custom config', async () => {
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    loadModels(result.value);
    const { container } = render(
      <RuneTypeGraph
        config={{
          layout: { direction: 'LR' },
          showMinimap: true,
          showControls: true,
          readOnly: true
        }}
      />
    );

    expect(container.querySelector('.rune-type-graph')).toBeTruthy();
  });

  it('accepts multiple models loaded into store', async () => {
    const result1 = await parse(SIMPLE_INHERITANCE_SOURCE);
    const result2 = await parse(COMBINED_MODEL_SOURCE);
    loadModels([result1.value, result2.value]);
    const { container } = render(<RuneTypeGraph />);

    expect(container.querySelector('.rune-type-graph')).toBeTruthy();
  });
});
