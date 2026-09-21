// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { FormPreviewSchema } from '@rune-langium/codegen/export';
import {
  createInstanceGenerateSchemaMessage,
  isInstanceGenerateSchemaResultMessage,
  isInstanceGenerateSchemaStaleMessage,
  isPreviewExecuteErrorMessage,
  isPreviewExecuteResultMessage
} from './codegen-service.js';
import type { InstanceReadiness } from './instance-readiness.js';
import { withInstrumentation } from './instrumentation/core.js';

export interface PreviewSessionClient {
  schema(typeFqn: string, signal: AbortSignal): Promise<FormPreviewSchema>;
  execute(functionFqn: string, inputs: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
  dispose(): void;
}

let clientSequence = 0;
const PREFIX = 'prototype-session:';
interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

function abortError(): DOMException {
  return new DOMException('Function session request was cancelled.', 'AbortError');
}

export const isPrototypeSessionRequest = withInstrumentation(
  function isPrototypeSessionRequest(requestId: string): boolean {
    return requestId.startsWith(PREFIX);
  },
  { op: 'isPrototypeSessionRequest' }
);

export const createPreviewSessionClient = withInstrumentation(
  function createPreviewSessionClient(worker: Worker, readiness: InstanceReadiness): PreviewSessionClient {
    const clientId = `${PREFIX}${++clientSequence}:`;
    let requestSequence = 0;
    let disposed = false;
    const pending = new Map<string, PendingRequest>();

    function settle(requestId: string, callback: (entry: PendingRequest) => void) {
      const entry = pending.get(requestId);
      if (!entry) return false;
      pending.delete(requestId);
      clearTimeout(entry.timer);
      callback(entry);
      return true;
    }

    function onMessage(event: MessageEvent<unknown>): void {
      const msg = event.data;
      if (isPreviewExecuteResultMessage(msg)) settle(msg.requestId, (entry) => entry.resolve(msg.output));
      else if (isPreviewExecuteErrorMessage(msg)) settle(msg.requestId, (entry) => entry.reject(new Error(msg.error)));
      else if (isInstanceGenerateSchemaResultMessage(msg)) settle(msg.requestId, (entry) => entry.resolve(msg.schema));
      else if (isInstanceGenerateSchemaStaleMessage(msg))
        settle(msg.requestId, (entry) => entry.reject(new Error(msg.message)));
    }
    worker.addEventListener('message', onMessage as EventListener);

    function request<T>(message: unknown, signal: AbortSignal, timeoutMs: number): Promise<T> {
      if (disposed) return Promise.reject(new Error('Function session client has been disposed.'));
      if (signal.aborted) return Promise.reject(abortError());
      const requestId = `${clientId}${++requestSequence}`;
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(
          () => settle(requestId, (entry) => entry.reject(new Error('Function session request timed out.'))),
          timeoutMs
        );
        const onAbort = () => settle(requestId, (entry) => entry.reject(abortError()));
        signal.addEventListener('abort', onAbort, { once: true });
        pending.set(requestId, {
          resolve: (value) => {
            signal.removeEventListener('abort', onAbort);
            resolve(value as T);
          },
          reject: (error) => {
            signal.removeEventListener('abort', onAbort);
            reject(error);
          },
          timer
        });
        try {
          worker.postMessage({ ...(message as object), requestId });
        } catch (error) {
          settle(requestId, (entry) => entry.reject(error instanceof Error ? error : new Error(String(error))));
        }
      });
    }

    return {
      async schema(typeFqn, signal) {
        await readiness.ensure(typeFqn, signal);
        return request<FormPreviewSchema>(
          { ...createInstanceGenerateSchemaMessage(typeFqn, ''), requestId: undefined },
          signal,
          30_000
        );
      },
      async execute(functionFqn, inputs, signal) {
        await readiness.ensure(functionFqn, signal);
        return request({ type: 'preview:execute', funcName: functionFqn, inputs }, signal, 120_000);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        worker.removeEventListener('message', onMessage as EventListener);
        for (const [requestId, entry] of pending) {
          pending.delete(requestId);
          clearTimeout(entry.timer);
          entry.reject(new Error('Function session client has been disposed.'));
        }
      }
    };
  },
  { op: 'createPreviewSessionClient' }
);
