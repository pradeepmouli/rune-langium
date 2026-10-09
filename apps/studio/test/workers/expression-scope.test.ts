// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { getExpressionRegions } from '@rune-langium/core';
import { createParserWorkerHarness } from './parser-worker-harness.js';

describe('builder scope in the linked parser worker', () => {
  it('reuses the linked document and rejects a stale expression position', async () => {
    const worker = createParserWorkerHarness();
    const source =
      'namespace test\nversion "test"\nfunc Calculate:\n inputs: amount int (1..1)\n output: calculated int (1..1)\n set calculated: amount + 1';
    const parsed = await worker.send({
      type: 'parseWorkspace',
      id: '1',
      files: [{ name: 'file:///scope.rosetta', content: source }]
    });
    if (parsed.type !== 'parseWorkspaceResult') throw new Error('fixture response');
    const owner = parsed.models[0]!.elements.find((e) => e.$type === 'RosettaFunction')!;
    if (owner.$type !== 'RosettaFunction') throw new Error('fixture owner');
    const region = getExpressionRegions(owner)[0]!.region;
    const request = {
      type: 'expressionScope' as const,
      id: '2',
      uri: 'file:///scope.rosetta',
      name: 'Calculate',
      region
    };
    const result = await worker.send(request);
    expect(result.type).toBe('expressionScopeResult');
    if (result.type !== 'expressionScopeResult') throw new Error('fixture scope');
    expect(result.error).toBeUndefined();
    expect(result.entries).toContainEqual(expect.objectContaining({ name: 'calculated', kind: 'output' }));
    const stale = await worker.send({ ...request, id: '3', region: { from: 0, to: 1 } });
    expect(stale).toEqual(
      expect.objectContaining({ entries: [], error: 'The expression source changed. Reopen the builder.' })
    );
  });
});
