// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, expect, it, vi } from 'vitest';
import { getExpressionRegions, createRuneDslServices, addLegacyAnnotations } from '@rune-langium/core';
import { URI } from 'langium';
import { resolve } from 'node:path';
import { referenceFiles } from '../../../../packages/codegen/test/helpers/cdm-reference.js';
import { makeNodeId } from '@rune-langium/visual-editor/identifiers';
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

it('opens the dispatch base Builder scope through the parser worker', async () => {
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
    'dispatch.rosetta',
    `namespace browser.scope
enum Kind:
 Cash
func Compute(kind: Kind -> Cash):
 set result: amount + 1
func Compute:
 inputs: kind Kind (1..1)
          amount int (1..1)
 output: result int (1..1)
 set result: amount
`
  );
  const parsed = await parseWorkspaceFiles([file]);
  const owner = parsed.models[0]!.elements.find((node) => node.$type === 'RosettaFunction' && !node.dispatchAttribute)!;
  if (owner.$type !== 'RosettaFunction') throw new Error('fixture dispatch base');
  const scope = await requestExpressionScope(
    file.path,
    makeNodeId('browser.scope', 'Compute', 'RosettaFunction'),
    getExpressionRegions(owner)[0]!.region,
    [file]
  );
  expect(scope).toContainEqual(expect.objectContaining({ name: 'kind', kind: 'input' }));
  expect(scope).toContainEqual(expect.objectContaining({ name: 'amount', kind: 'input' }));
  expect(scope).toContainEqual(expect.objectContaining({ name: 'result', kind: 'output' }));
});

it('links the pinned ten-operation browser fixture with all of its original dependencies', async () => {
  const { RuneDsl } = createRuneDslServices();
  const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
  const docs = referenceFiles(resolve(import.meta.dirname, '../fixtures/cdm-expression')).map(({ uri, content }) => {
    const doc = factory.fromString(content, URI.parse(uri));
    return uri.endsWith('/annotations.rosetta') ? addLegacyAnnotations(doc, factory) : doc;
  });
  await RuneDsl.shared.workspace.DocumentBuilder.build(docs, { validation: false });
  expect(docs.flatMap((doc) => [...doc.parseResult.parserErrors, ...doc.parseResult.lexerErrors])).toEqual([]);
  expect(docs.flatMap((doc) => doc.references.filter((ref) => ref.error).map((ref) => ref.error!.message))).toEqual([]);
  const func = docs
    .flatMap((doc) => doc.parseResult.value.elements)
    .find((node) => node.$type === 'RosettaFunction' && node.name === 'ConvertToAdjustableOrRelativeDate');
  if (func?.$type !== 'RosettaFunction') throw Error('Missing fixture function');
  expect(func.operations).toHaveLength(10);
  expect(func.shortcuts).toHaveLength(1);
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
type Calculate:
 amount int (1..1)
 condition Positive: amount > 0
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
  const scope = await requestExpressionScope(
    file.path,
    makeNodeId('browser.scope', owner.name, owner.$type),
    region,
    files
  );
  expect(scope).toContainEqual(expect.objectContaining({ name: 'factor', kind: 'input' }));
  expect(scope).toContainEqual(expect.objectContaining({ name: 'calculated', kind: 'output' }));
  expect(scope).toContainEqual(
    expect.objectContaining({ name: 'CurrentDependency', kind: 'callable', argumentCount: 2 })
  );
  expect(scope.map((entry) => entry.name)).not.toContain('StaleDependency');
  expect(scope.map((entry) => entry.name)).not.toContain('amount');
  const data = parsed.models[0]!.elements.find((node) => node.$type === 'Data')!;
  if (data.$type !== 'Data') throw new Error('fixture Data');
  const dataScope = await requestExpressionScope(
    file.path,
    makeNodeId('browser.scope', data.name, data.$type),
    getExpressionRegions(data)[0]!.region,
    files
  );
  expect(dataScope).toContainEqual(expect.objectContaining({ name: 'amount', kind: 'attribute' }));
  expect(dataScope.map((entry) => entry.name)).not.toContain('factor');
  await expect(requestExpressionScope(file.path, owner.name, region, files)).rejects.toThrow('owner is unavailable');
  await expect(
    requestExpressionScope(file.path, makeNodeId('browser.scope', owner.name, owner.$type), { from: 0, to: 1 }, files)
  ).rejects.toThrow('source changed');
});
