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

  it('executes models whose type names match private evaluator bindings', async () => {
    const { scope, dispatch } = await loadRealWorker();
    dispatch({
      type: 'preview:setFiles',
      requestId: 'bindings:files',
      files: [
        {
          uri: 'file:///bindings.rosetta',
          content: `namespace bindings
type __generatedRuntime:
 value int (1..1)
type __module:
 value int (1..1)
type __functionRuntime:
 value int (1..1)
func Read:
 inputs: value __generatedRuntime (1..1)
 output: result __module (1..1)
 set result: __module {value: value -> value}`
        }
      ]
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    dispatch({
      type: 'preview:execute',
      funcName: 'bindings.Read',
      inputs: { value: { value: 7 } },
      requestId: 'bindings:execute'
    });
    await waitForMessage(scope, 'preview:execute-result');
    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'preview:execute-result',
      funcName: 'bindings.Read',
      requestId: 'bindings:execute',
      output: { value: 7 }
    });
  }, 15_000);

  it.each([undefined, 5])(
    'adapts raw inherited metadata inputs, including recursive fields (optional=%s)',
    async (maybe) => {
      const { scope, dispatch } = await loadRealWorker();
      dispatch({
        type: 'preview:setFiles',
        requestId: 'metadata:files',
        files: [
          {
            uri: 'file:///metadata.rosetta',
            content: `namespace forms
type Payload:
 next Payload (0..1)
 value int (1..1)
 items int (0..*)
  [metadata scheme]
type Result:
 amount int (1..1)
 maybe int (0..1)
 values int (0..*)
 payload Payload (1..1)
func Base:
 inputs:
  amount int (1..1)
   [metadata scheme]
  maybe int (0..1)
   [metadata reference]
  values int (0..*)
   [metadata reference]
  payload Payload (1..1)
   [metadata scheme]
 output: result Result (1..1)
 set result: Result { amount: amount, maybe: maybe, values: values, payload: payload }
func Derived extends Base:
 set result: super(amount, maybe, values, payload)`
          }
        ]
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const tail = { value: 9, items: [6] };
      const inputs = {
        amount: 0,
        maybe,
        values: [0, 2],
        payload: { value: 7, items: [3, 4], next: { value: 8, items: [], next: { value: 8, items: [], next: tail } } }
      };
      const original = structuredClone(inputs);
      dispatch({ type: 'preview:execute', funcName: 'forms.Derived', inputs, requestId: 'metadata:execute' });
      await waitForMessage(scope, 'preview:execute-result');
      expect(scope.postMessage).toHaveBeenLastCalledWith({
        type: 'preview:execute-result',
        funcName: 'forms.Derived',
        requestId: 'metadata:execute',
        output: {
          amount: 0,
          maybe,
          values: [0, 2],
          payload: {
            value: 7,
            items: [
              { value: 3, meta: {} },
              { value: 4, meta: {} }
            ],
            next: {
              value: 8,
              items: [],
              next: { value: 8, items: [], next: { value: 9, items: [{ value: 6, meta: {} }] } }
            }
          }
        }
      });
      expect(inputs).toEqual(original);
    },
    15_000
  );

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
