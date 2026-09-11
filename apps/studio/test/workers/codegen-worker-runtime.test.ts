// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, expect, it, vi } from 'vitest';

type WorkerScope = {
  addEventListener: ReturnType<typeof vi.fn>;
  postMessage: ReturnType<typeof vi.fn>;
  importScripts: () => void;
};

async function loadRealWorker() {
  let handler: ((event: MessageEvent<unknown>) => void) | undefined;
  const scope: WorkerScope = {
    addEventListener: vi.fn((type: string, listener: (event: MessageEvent<unknown>) => void) => {
      if (type === 'message') handler = listener;
    }),
    postMessage: vi.fn(),
    importScripts: () => undefined
  };
  vi.stubGlobal('self', scope);
  vi.resetModules();
  await import('../../src/workers/codegen-worker.ts');
  return {
    scope,
    dispatch(data: unknown) {
      if (!handler) throw new Error('worker message handler was not registered');
      handler({ data } as MessageEvent<unknown>);
    }
  };
}

async function waitForMessage(scope: WorkerScope, type: string): Promise<void> {
  await vi.waitFor(() => {
    expect(scope.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type }));
  });
}

describe('codegen-worker parsed/emitted function execution', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('executes qualified calls when both namespaces declare the same function name', async () => {
    const { scope, dispatch } = await loadRealWorker();
    dispatch({
      type: 'preview:setFiles',
      requestId: 'qualified:files',
      files: [
        {
          uri: 'file:///alpha.rosetta',
          content: `namespace alpha
func Echo:
 inputs: value int (1..1)
 output: result int (1..1)
 set result: value + 1`
        },
        {
          uri: 'file:///beta.rosetta',
          content: `namespace beta
func Echo:
 inputs: value int (1..1)
 output: result int (1..1)
 alias Echo: value + 10
 set result: alpha.Echo(value) + Echo`
        }
      ]
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    dispatch({ type: 'preview:execute', funcName: 'beta.Echo', inputs: { value: 4 }, requestId: 'qualified:execute' });
    await waitForMessage(scope, 'preview:execute-result');
    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'preview:execute-result',
      funcName: 'beta.Echo',
      requestId: 'qualified:execute',
      output: 19
    });
  }, 15_000);

  it('executes a parsed and emitted function using generated generic set helpers', async () => {
    const { scope, dispatch } = await loadRealWorker();
    dispatch({
      type: 'preview:setFiles',
      files: [
        {
          uri: 'file:///real-preview.rosetta',
          content: `
            namespace "real.preview"
            version "1"
            func Unique:
              inputs:
                values number (0..*)
              output:
                result number (0..*)
              set result: values distinct
          `
        }
      ],
      requestId: 'real:files'
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    dispatch({
      type: 'preview:execute',
      funcName: 'real.preview.Unique',
      inputs: { values: [2, 2, 1] },
      requestId: 'real:execute'
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await waitForMessage(scope, 'preview:execute-result');

    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'preview:execute-result',
      requestId: 'real:execute',
      funcName: 'real.preview.Unique',
      output: [2, 1]
    });
  }, 15_000);
});
