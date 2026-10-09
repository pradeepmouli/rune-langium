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
  it.each([
    ['typescript', 'line', false],
    ['typescript', 'block', false],
    ['python', 'line', false],
    ['python', 'block', false],
    ['typescript', 'line', true],
    ['typescript', 'block', true],
    ['python', 'line', true],
    ['python', 'block', true]
  ] as const)('projects %s with a trailing %s body comment, serialized=%s', async (language, comment, serialized) => {
    const fixture =
      source +
      (comment === 'line' ? ' // trailing body comment' : ' /* trailing body comment */') +
      '\n// Neighbor documentation\nfunc Neighbor:\n output: result int (1..1)\n set result: 2\n';
    const parsed = await parse(fixture);
    expect(parsed.parserErrors).toEqual([]);
    const owner = parsed.value.elements[0]!;
    const region = getFunctionImplementationRegion(owner, fixture);
    expect(fixture.slice(region.from, region.to)).toContain('trailing body comment');
    expect(fixture.slice(region.from, region.to)).not.toContain('Neighbor documentation');
    const { RuneDsl } = createRuneDslServices();
    const { scope, dispatch } = await loadRealWorker();
    const subject = { uri: 'file:///comments.rosetta', nodeId: 'test.Calculate#RosettaFunction', region };
    dispatch({
      type: 'preview:setFiles',
      filesRevision: 1,
      files: [
        {
          uri: subject.uri,
          content: fixture,
          ...(serialized
            ? { serializedModelJson: serializeRuneModel(RuneDsl.serializer.JsonSerializer, parsed.value) }
            : {})
        }
      ]
    });
    dispatch({
      type: 'projection:generate',
      requestId: 'comments',
      language,
      kind: 'function',
      source: fixture,
      subject,
      filesRevision: 1
    });
    await vi.waitFor(() =>
      expect(scope.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'projection:result', requestId: 'comments' })
      )
    );
    const response = scope.postMessage.mock.calls
      .map(([message]) => message)
      .find((message) => message.requestId === 'comments');
    expect(response.projection.code).toContain(
      language === 'typescript' ? 'export function Calculate(' : 'def Calculate('
    );
    expect(response.projection.code).not.toContain('Neighbor');
    expect(response.projection.subject).toEqual(subject);
    expect(response.projection.sourceMap[0]).toMatchObject({ sourceUri: subject.uri, sourceLine: 2 });
    dispatch({
      type: 'projection:generate',
      requestId: 'cross-owner',
      language,
      kind: 'function',
      source: fixture,
      subject: { ...subject, region: { ...region, to: fixture.length } },
      filesRevision: 1
    });
    await vi.waitFor(() =>
      expect(scope.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'projection:error', requestId: 'cross-owner' })
      )
    );
  });
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
