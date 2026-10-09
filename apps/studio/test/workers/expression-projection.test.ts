// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRealWorker } from './helpers/real-codegen-worker.js';
import {
  parse,
  getExpressionRegions,
  getFunctionImplementationRegion,
  serializeRuneModel,
  createRuneDslServices
} from '@rune-langium/core';

const source = 'namespace test\nfunc Calculate:\n output: result int (1..1)\n set result: 1\n';
afterEach(() => vi.unstubAllGlobals());

async function requestFixture(language: 'typescript' | 'python' = 'typescript') {
  const parsed = await parse(source);
  const region = getFunctionImplementationRegion(parsed.value.elements[0], source);
  return {
    type: 'projection:generate',
    language,
    kind: 'function',
    source,
    subject: { uri: 'file:///test.rosetta', nodeId: 'test.Calculate#RosettaFunction', region },
    filesRevision: 1
  };
}

describe('linked expression projections', () => {
  it.each(['typescript', 'python'] as const)('matches the edited Data condition expression in %s', async (language) => {
    const conditionSource =
      'namespace test\ntype Invoice:\n amount int (1..1)\n condition AmountPositive:\n  amount > 0\n';
    const parsed = await parse(conditionSource);
    const region = getExpressionRegions(parsed.value.elements[0])[0]!.region;
    const { scope, dispatch } = await loadRealWorker();
    const subject = { uri: 'file:///condition.rosetta', nodeId: 'test.Invoice#Data', region };
    dispatch({ type: 'preview:setFiles', filesRevision: 1, files: [{ uri: subject.uri, content: conditionSource }] });
    dispatch({
      type: 'projection:generate',
      requestId: 'condition',
      language,
      kind: 'condition',
      source: conditionSource,
      subject,
      filesRevision: 1
    });
    await vi.waitFor(() =>
      expect(scope.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'projection:result', requestId: 'condition' })
      )
    );
    const response = scope.postMessage.mock.calls
      .map(([message]) => message)
      .find((message) => message.requestId === 'condition');
    expect(response.projection.code).toContain('amount');
  });
  it.each(['typescript', 'python'] as const)(
    'shows a full typed %s function and rejects outdated source/revisions',
    async (language) => {
      const { scope, dispatch } = await loadRealWorker();
      const request = await requestFixture(language);
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
      expect(response.projection.code).toContain(
        language === 'typescript' ? 'export function Calculate(' : 'def Calculate('
      );
      expect(response.projection.code).toContain(language === 'typescript' ? ': number' : '-> float:');
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
    }
  );
  it.each(['typescript', 'python'] as const)(
    'projects serialized curated declarations as %s with original source coordinates',
    async (language) => {
      const { scope, dispatch } = await loadRealWorker();
      const request = await requestFixture(language);
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
    }
  );
});
