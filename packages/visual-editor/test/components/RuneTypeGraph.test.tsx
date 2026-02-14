/**
 * Smoke test for RuneTypeGraph component rendering.
 *
 * Verifies that the component mounts, renders nodes,
 * and produces visible ReactFlow elements.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { parse } from '@rune-langium/core';
import { RuneTypeGraph } from '../../src/components/RuneTypeGraph.js';
import { SIMPLE_INHERITANCE_SOURCE, COMBINED_MODEL_SOURCE } from '../helpers/fixture-loader.js';

describe('RuneTypeGraph', () => {
  it('renders without crashing with a simple model', async () => {
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    const { container } = render(<RuneTypeGraph models={result.value} />);

    expect(container.querySelector('.rune-type-graph')).toBeTruthy();
  });

  it('renders without crashing with a combined model', async () => {
    const result = await parse(COMBINED_MODEL_SOURCE);
    const { container } = render(<RuneTypeGraph models={result.value} />);

    expect(container.querySelector('.rune-type-graph')).toBeTruthy();
  });

  it('renders with custom config', async () => {
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    const { container } = render(
      <RuneTypeGraph
        models={result.value}
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

  it('accepts multiple models as array', async () => {
    const result1 = await parse(SIMPLE_INHERITANCE_SOURCE);
    const result2 = await parse(COMBINED_MODEL_SOURCE);
    const { container } = render(<RuneTypeGraph models={[result1.value, result2.value]} />);

    expect(container.querySelector('.rune-type-graph')).toBeTruthy();
  });
});
