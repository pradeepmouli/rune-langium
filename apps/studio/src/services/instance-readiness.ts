// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { withInstrumentation } from './instrumentation/core.js';
import type { FormPreviewSchema } from '@rune-langium/codegen/export';

export interface InstanceReadiness {
  ensure(typeFqn: string, signal: AbortSignal): Promise<number>;
  hydrateSchemaDependencies(schema: FormPreviewSchema, signal: AbortSignal): Promise<boolean>;
  dispose(): void;
}

export interface ReadinessDeps {
  findNamespaces(typeFqn: string): readonly string[];
  findNamespacesForUnresolved?(names: readonly string[]): readonly string[];
  hydrate(namespace: string, signal: AbortSignal): Promise<void>;
  waitForWorkerFiles(signal: AbortSignal): Promise<number>;
}

function abortError(): DOMException {
  return new DOMException('Instance preparation was cancelled.', 'AbortError');
}

function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

/**
 * Coordinates the hydration and worker-file acknowledgement required before an
 * instance schema or validation request can use a deferred curated type.
 *
 * The shared operation is intentionally independent of any caller's abort
 * signal: cancelling one panel must not cancel another panel preparing the
 * same type. Each caller instead aborts only its own wait.
 */
export const createInstanceReadiness = withInstrumentation(
  function createInstanceReadiness(deps: ReadinessDeps): InstanceReadiness {
    const operations = new Map<string, { controller: AbortController; promise: Promise<number> }>();
    let disposed = false;

    function begin(key: string, namespaces: readonly string[]): Promise<number> {
      const existing = operations.get(key);
      if (existing) return existing.promise;

      const controller = new AbortController();
      const promise = Promise.resolve()
        .then(async () => {
          for (const namespace of namespaces) {
            await deps.hydrate(namespace, controller.signal);
          }
          // This is a new dispatch and acknowledgement for this hydrated
          // workspace snapshot. An earlier hydration nonce or acknowledgement
          // cannot prove that React's file-sync effect has reached the worker.
          return deps.waitForWorkerFiles(controller.signal);
        })
        .finally(() => {
          if (operations.get(key)?.promise === promise) operations.delete(key);
        });
      operations.set(key, { controller, promise });
      return promise;
    }

    return {
      ensure(typeFqn, signal) {
        if (disposed) return Promise.reject(new Error('Instance readiness has been disposed.'));
        return awaitWithAbort(begin(`target:${typeFqn}`, deps.findNamespaces(typeFqn)), signal);
      },
      async hydrateSchemaDependencies(schema, signal) {
        if (disposed) throw new Error('Instance readiness has been disposed.');
        const unresolvedNames = (schema.unsupportedFeatures ?? [])
          .filter((feature) => feature.startsWith('unresolved-reference:'))
          .map((feature) => feature.slice('unresolved-reference:'.length));
        const namespaces = [...new Set(deps.findNamespacesForUnresolved?.(unresolvedNames) ?? [])].sort();
        if (namespaces.length === 0) return false;
        await awaitWithAbort(begin(`references:${namespaces.join(',')}`, namespaces), signal);
        return true;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const operation of operations.values()) operation.controller.abort();
        operations.clear();
      }
    };
  },
  { op: 'createInstanceReadiness' }
);
