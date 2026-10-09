// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { dispatchWorkerRequest } from '../../src/workers/parser-worker.js';
import { createParserWorkerHarness } from './parser-worker-harness.js';

describe('expression scope snapshot ownership', () => {
  it('removes deleted declarations from an unchanged owner’s scope', async () => {
    const owner = 'namespace snapshot\nfunc Calc:\n output: out int (1..1)\n set out: 1';
    const file = { name: 'file:///owner.rosetta', content: owner };
    const request = {
      type: 'expressionScope' as const,
      id: 'deleted-scope',
      uri: file.name,
      name: 'Calc',
      region: { from: owner.length - 1, to: owner.length }
    };
    const previous = await dispatchWorkerRequest({
      ...request,
      files: [
        file,
        {
          name: 'file:///removed.rosetta',
          content:
            'namespace snapshot\ntype Cash:\n amount int (1..1)\nchoice RemovedChoice:\n Cash\nenum RemovedEnum:\n RemovedValue'
        }
      ]
    });
    if (previous.type !== 'expressionScopeResult') throw new Error('Unexpected response');
    expect(previous.error).toBeUndefined();
    expect(previous.entries).toContainEqual(expect.objectContaining({ name: 'RemovedChoice', kind: 'choice' }));
    const removed = previous.entries.filter((entry) => entry.declarationId.startsWith('file:///removed.rosetta#'));
    expect(removed.some((entry) => entry.kind === 'enum')).toBe(true);

    const current = await dispatchWorkerRequest({ ...request, files: [file] });
    if (current.type !== 'expressionScopeResult') throw new Error('Unexpected response');
    expect(current.error).toBeUndefined();
    expect(current.entries.filter((entry) => entry.declarationId.startsWith('file:///removed.rosetta#'))).toEqual([]);
  });

  it.each(['parseWorkspace', 'hydrate'] as const)(
    'clears parsed and unmaterialized exports for an empty %s',
    async (type) => {
      const worker = createParserWorkerHarness();
      await worker.send({
        type: 'parseWorkspace',
        id: 'old-parsed',
        files: [{ name: 'file:///old.rosetta', content: 'namespace old\ntype OldParsed:\n value int (1..1)' }]
      });
      expect(worker.findExport('OldParsed')).toBeDefined();
      await worker.send(type === 'hydrate' ? { type, id: 'empty', documents: [] } : { type, id: 'empty', files: [] });
      expect(worker.findExport('OldParsed')).toBeUndefined();

      await worker.send({
        type: 'hydrate',
        id: 'old-deferred',
        documents: [
          {
            uri: 'file:///deferred.rosetta',
            content: '',
            serializedModel: worker.serializeSample('old', 'OldDeferred'),
            exports: [{ name: 'OldDeferred', type: 'Data', path: '/elements@0' }]
          }
        ]
      });
      expect(worker.findExport('OldDeferred')).toBeDefined();
      expect(worker.hasDeferredModel('file:///deferred.rosetta')).toBe(true);
      await worker.send(
        type === 'hydrate' ? { type, id: 'empty-deferred', documents: [] } : { type, id: 'empty-deferred', files: [] }
      );
      expect(worker.findExport('OldDeferred')).toBeUndefined();
      expect(worker.hasDeferredModel('file:///deferred.rosetta')).toBe(false);
    }
  );

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
