// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { FormPreviewSchema } from '@rune-langium/codegen/export';
import type { InstanceRecord } from '@rune-langium/codegen/instances';
import type { PreviewSessionClient } from '../services/preview-session-client.js';
import { withInstrumentation } from '../services/instrumentation/core.js';

export interface FunctionSessionState {
  functionFqn: string | null;
  boundParameter: string | null;
  inputs: Record<string, unknown>;
  result: unknown;
  status: 'idle' | 'running' | 'succeeded' | 'failed';
  error?: string;
  schema?: FormPreviewSchema;
}

export interface FunctionSession {
  getState(): FunctionSessionState;
  subscribe(listener: () => void): () => void;
  selectFunction(fqn: string): Promise<void>;
  setInput(name: string, value: unknown): void;
  setInputs(inputs: Record<string, unknown>): void;
  bindInstance(parameter: string, record: InstanceRecord): void;
  run(): Promise<void>;
  dispose(): void;
}

const INITIAL_STATE: FunctionSessionState = {
  functionFqn: null,
  boundParameter: null,
  inputs: {},
  result: undefined,
  status: 'idle'
};

export const createFunctionSession = withInstrumentation(
  function createFunctionSession(client: PreviewSessionClient): FunctionSession {
    let state = INITIAL_STATE;
    let disposed = false;
    let selectionVersion = 0;
    let activeController: AbortController | undefined;
    const listeners = new Set<() => void>();
    const notify = () => listeners.forEach((listener) => listener());
    const patch = (next: Partial<FunctionSessionState>) => {
      state = { ...state, ...next };
      notify();
    };

    return {
      getState: () => state,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      async selectFunction(fqn) {
        const version = ++selectionVersion;
        activeController?.abort();
        const controller = new AbortController();
        activeController = controller;
        patch({
          functionFqn: fqn,
          boundParameter: null,
          inputs: {},
          result: undefined,
          status: 'running',
          error: undefined,
          schema: undefined
        });
        try {
          const schema = await client.schema(fqn, controller.signal);
          if (disposed || version !== selectionVersion) return;
          patch({ schema, status: 'idle' });
        } catch (error) {
          if (disposed || version !== selectionVersion || controller.signal.aborted) return;
          patch({ status: 'failed', error: error instanceof Error ? error.message : String(error) });
        }
      },
      setInput(name, value) {
        patch({ inputs: { ...state.inputs, [name]: structuredClone(value) } });
      },
      setInputs(inputs) {
        patch({ inputs: structuredClone(inputs) });
      },
      bindInstance(parameter, record) {
        patch({ boundParameter: parameter, inputs: { ...state.inputs, [parameter]: structuredClone(record.data) } });
      },
      async run() {
        if (!state.functionFqn || state.status === 'running') return;
        const version = selectionVersion;
        activeController?.abort();
        const controller = new AbortController();
        activeController = controller;
        const inputs = structuredClone(state.inputs);
        patch({ status: 'running', result: undefined, error: undefined });
        try {
          const result = await client.execute(state.functionFqn, inputs, controller.signal);
          if (disposed || version !== selectionVersion) return;
          patch({ result, status: 'succeeded' });
        } catch (error) {
          if (disposed || version !== selectionVersion || controller.signal.aborted) return;
          patch({ status: 'failed', error: error instanceof Error ? error.message : String(error) });
        }
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        activeController?.abort();
        listeners.clear();
        client.dispose();
      }
    };
  },
  { op: 'createFunctionSession' }
);
