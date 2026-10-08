// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, expect, it, vi } from 'vitest';
import { getExpressionRegions } from '@rune-langium/core';
import { createParserWorkerHarness } from '../workers/parser-worker-harness.js';
import {
  _resetParserWorkerForTests,
  createWorkspaceFile,
  parseWorkspaceFiles,
  requestExpressionScope
} from '../../src/services/workspace.js';
import { pathToUri } from '../../src/utils/uri.js';
import type { WorkerRequest } from '../../src/workers/parser-worker.js';

afterEach(() => {
  _resetParserWorkerForTests();
  vi.unstubAllGlobals();
});

it.each([false, true])('opens current builder scope after router fallback with stale worker=%s', async (stale) => {
  const harness = createParserWorkerHarness();
  class HarnessWorker extends EventTarget {
    postMessage(request: WorkerRequest) {
      void harness.send(request).then((data) => this.dispatchEvent(new MessageEvent('message', { data })));
    }
    terminate() {}
  }
  vi.stubGlobal('Worker', HarnessWorker);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  const file = createWorkspaceFile(
    'scope.rosetta',
    `namespace browser.scope
func Calculate:
 inputs: factor number (1..1)
 output: calculated number (1..1)
 set calculated: factor + 1
`
  );
  const dependency = createWorkspaceFile(
    'dependency.rosetta',
    `namespace browser.scope
func CurrentDependency:
 inputs: leftValue number (1..1)
         rightValue number (1..1)
 output: result number (1..1)
 set result: leftValue + rightValue
`
  );
  await harness.send({
    type: 'parseWorkspace',
    id: 'seed',
    files: stale
      ? [
          { name: pathToUri(file.path), content: file.content.replaceAll('factor', 'amount') },
          {
            name: pathToUri(dependency.path),
            content: dependency.content.replaceAll('CurrentDependency', 'StaleDependency')
          }
        ]
      : []
  });
  const files = [file, dependency];
  const parsed = await parseWorkspaceFiles(files);
  expect(parsed.parseMode).toBe('main-thread-fallback');
  const owner = parsed.models[0]!.elements.find((node) => node.$type === 'RosettaFunction')!;
  if (owner.$type !== 'RosettaFunction') throw new Error('fixture owner');
  const region = getExpressionRegions(owner)[0]!.region;
  const scope = await requestExpressionScope(file.path, owner.name, region, files);
  expect(scope).toContainEqual(expect.objectContaining({ name: 'factor', kind: 'input' }));
  expect(scope).toContainEqual(expect.objectContaining({ name: 'calculated', kind: 'output' }));
  expect(scope).toContainEqual(
    expect.objectContaining({ name: 'CurrentDependency', kind: 'callable', argumentCount: 2 })
  );
  expect(scope.map((entry) => entry.name)).not.toContain('StaleDependency');
  expect(scope.map((entry) => entry.name)).not.toContain('amount');
  await expect(requestExpressionScope(file.path, owner.name, { from: 0, to: 1 }, files)).rejects.toThrow(
    'source changed'
  );
});
