// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRealWorker } from './helpers/real-codegen-worker.js';
import { parse, getFunctionImplementationRegion, serializeRuneModel, createRuneDslServices } from '@rune-langium/core';

const source = 'namespace test\nfunc Calculate:\n output: result int (1..1)\n set result: 1\n';
afterEach(() => vi.unstubAllGlobals());

async function requestFixture() {
  const parsed = await parse(source);
  const region = getFunctionImplementationRegion(parsed.value.elements[0], source);
  return {
    type: 'projection:generate',
    language: 'typescript',
    kind: 'function',
    source,
    subject: { uri: 'file:///test.rosetta', nodeId: 'test.Calculate#RosettaFunction', region },
    filesRevision: 1
  };
}

describe('linked expression projections', () => {
  it('shows a full typed function and rejects outdated source/revisions', async () => {
    const { scope, dispatch } = await loadRealWorker();
    const request = await requestFixture();
    dispatch({ type: 'preview:setFiles', filesRevision: 1, files: [{ uri: request.subject.uri, content: source }] });
    dispatch({ ...request, requestId: 'first' });
    await vi.waitFor(() =>
      expect(scope.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'projection:result', requestId: 'first' })
      )
    );
    const response = scope.postMessage.mock.calls
      .map(([message]) => message)
      .find((message) => message.requestId === 'first');
    expect(response.projection.code).toContain('export function Calculate(');
    expect(response.projection.code).toContain(': number');
    expect(response.projection.code).not.toContain('not renderable');
    dispatch({
      type: 'preview:setFiles',
      filesRevision: 2,
      files: [{ uri: request.subject.uri, content: source.replace('result: 1', 'result: 2') }]
    });
    dispatch({ ...request, requestId: 'stale' });
    await vi.waitFor(() =>
      expect(scope.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'projection:error',
          requestId: 'stale',
          error: expect.stringContaining('source changed')
        })
      )
    );
  });
  it('projects serialized curated declarations read-only with original source coordinates', async () => {
    const { scope, dispatch } = await loadRealWorker();
    const request = await requestFixture();
    const parsed = await parse(source);
    const { RuneDsl } = createRuneDslServices();
    const serializedModelJson = serializeRuneModel(RuneDsl.serializer.JsonSerializer, parsed.value);
    dispatch({
      type: 'preview:setFiles',
      filesRevision: 1,
      files: [{ uri: request.subject.uri, content: source, serializedModelJson }]
    });
    dispatch({ ...request, requestId: 'curated' });
    await vi.waitFor(() =>
      expect(scope.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'projection:result', requestId: 'curated' })
      )
    );
  });
});
