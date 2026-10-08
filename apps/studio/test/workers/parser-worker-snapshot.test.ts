// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { dispatchWorkerRequest } from '../../src/workers/parser-worker.js';

describe('expression scope snapshot ownership', () => {
  it('keeps concurrent scope requests on their submitted source', async () => {
    const source = (input: string) =>
      `namespace snapshot\nfunc Calc:\n inputs: ${input} int (1..1)\n output: out int (1..1)\n set out: ${input} + 1`;
    const request = (id: string, input: string) => {
      const content = source(input);
      return dispatchWorkerRequest({
        type: 'expressionScope',
        id,
        uri: 'file:///scope.rosetta',
        name: 'Calc',
        region: { from: content.indexOf('set out: ') + 9, to: content.length },
        files: [{ name: 'file:///scope.rosetta', content }]
      });
    };
    const responses = await Promise.all([request('first', 'aaaa'), request('second', 'bbbb')]);
    for (const [index, name] of ['aaaa', 'bbbb'].entries()) {
      const response = responses[index]!;
      expect(response.type).toBe('expressionScopeResult');
      if (response.type !== 'expressionScopeResult') throw new Error('Unexpected response');
      expect(response.error).toBeUndefined();
      expect(response.entries.map((entry) => entry.name)).toContain(name);
      expect(response.entries.map((entry) => entry.name)).not.toContain(index === 0 ? 'bbbb' : 'aaaa');
    }
  });

  it('keeps dependencies from the scope snapshot when the owning file is unchanged', async () => {
    const owner = 'namespace snapshot\nfunc Calc:\n output: out int (1..1)\n set out: 1';
    const files = (name: string) => [
      { name: 'file:///same.rosetta', content: owner },
      {
        name: 'file:///dependency.rosetta',
        content: `namespace snapshot\nfunc ${name}:\n output: out int (1..1)\n set out: 1`
      }
    ];
    const [scope] = await Promise.all([
      dispatchWorkerRequest({
        type: 'expressionScope',
        id: 'current-scope',
        uri: 'file:///same.rosetta',
        name: 'Calc',
        region: { from: owner.length - 1, to: owner.length },
        files: files('NewFn')
      }),
      dispatchWorkerRequest({ type: 'parseWorkspace', id: 'older-parse', files: files('OldFn') })
    ]);
    if (scope.type !== 'expressionScopeResult') throw new Error('Unexpected response');
    expect(scope.error).toBeUndefined();
    expect(scope.entries.map((entry) => entry.name)).toContain('NewFn');
    expect(scope.entries.map((entry) => entry.name)).not.toContain('OldFn');
  });
});
