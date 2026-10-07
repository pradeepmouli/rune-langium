// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { referenceCases, referenceFiles } from '../../../../packages/codegen/test/helpers/cdm-reference.js';
import { loadRealWorker } from './helpers/real-codegen-worker.js';

describe('SC-009 real CDM Python parity through Studio runtime', () => {
  let worker: Awaited<ReturnType<typeof loadRealWorker>>;

  beforeAll(async () => {
    worker = await loadRealWorker();
    worker.dispatch({ type: 'preview:setFiles', filesRevision: 1, files: referenceFiles() });
  });

  afterAll(() => vi.unstubAllGlobals());

  it.each(referenceCases)(
    '$id ($function)',
    async (testCase) => {
      worker.dispatch({
        type: 'preview:execute',
        funcName: testCase.function,
        inputs: testCase.inputs,
        requestId: testCase.id
      });
      let result: { type: string; output?: unknown; error?: string } | undefined;
      await vi.waitFor(
        () => {
          result = worker.scope.postMessage.mock.calls
            .map(([message]) => message)
            .find((message) => message.requestId === testCase.id);
          expect(result).toBeDefined();
        },
        { timeout: 15000 }
      );
      if (testCase.expectedError) {
        expect(result!.type).toBe('preview:execute-error');
        expect(result!.error).toContain(testCase.expectedError);
      } else {
        expect(result!.type, result!.error).toBe('preview:execute-result');
        // Worker messages are structured-cloned in the browser; JSON also renders Temporal
        // values and omits absent optional members for comparison with Python model dumps.
        const output = JSON.parse(
          JSON.stringify(result!.output, (key, value) =>
            key === 'meta' && value && typeof value === 'object' && Object.keys(value).length === 0 ? undefined : value
          )
        );
        if (testCase.knownDifference) {
          expect(testCase.knownDifference.expectedRune).not.toEqual(testCase.expected);
          expect(output, testCase.knownDifference.reason).toEqual(testCase.knownDifference.expectedRune);
        } else if (testCase.absoluteTolerance) {
          expect(Math.abs(Number(output) - Number(testCase.expected))).toBeLessThanOrEqual(testCase.absoluteTolerance);
        } else {
          expect(output).toEqual(testCase.expected);
        }
      }
    },
    20000
  );
});
