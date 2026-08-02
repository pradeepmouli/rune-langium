// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { afterEach, describe, it, expect, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

class FakeWorker {
  static instances: FakeWorker[] = [];
  posted: any[] = [];
  listeners: Record<string, Function[]> = {};
  terminated = false;
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(m: any) {
    this.posted.push(m);
  }
  addEventListener(t: string, cb: Function) {
    (this.listeners[t] ||= []).push(cb);
  }
  removeEventListener(t: string, cb: Function) {
    this.listeners[t] = (this.listeners[t] || []).filter((f) => f !== cb);
  }
  terminate() {
    this.terminated = true;
  }
}

beforeEach(() => {
  FakeWorker.instances = [];
  window.__runeStudioTestApi = { createCodegenWorker: () => new FakeWorker() as unknown as Worker };
  useEditorStore.setState({ pendingHydrationNamespaces: [], hydratedNamespaces: [], hydrationNonce: 0 });
  resetInstrumentationForTests();
});

afterEach(() => {
  resetInstrumentationForTests();
});

import { CodegenProvider } from '../../../src/shell/providers/CodegenProvider.js';
import { WorkspaceStateContext, type WorkspaceState } from '../../../src/shell/providers/workspace-context.js';
import { usePreviewStore } from '../../../src/store/preview-store.js';
import { useEditorStore } from '@rune-langium/visual-editor';
import {
  configureInstrumentation,
  resetInstrumentationForTests,
  setInstrumentationThreshold,
  type TelemetryRecord
} from '../../../src/services/instrumentation/core.js';
import { MAX_HYDRATION_RETRIES_PER_TARGET } from '../../../src/services/hydration-orchestrator.js';

function wsState(id: string): WorkspaceState {
  return {
    workspaceId: id,
    workspaceKind: 'browser-only',
    workspaceName: id,
    fileCount: 1,
    files: [{ name: 'a.rosetta', path: 'a.rosetta', content: 'namespace a', dirty: false }],
    models: [],
    parsedModels: [],
    deferredExports: [
      {
        filePath: 'fpml/consolidated/shared/bundle.rosetta',
        namespace: 'fpml.consolidated.shared',
        exports: [{ type: 'data', name: 'NormalizedString' }]
      }
    ],
    parseErrors: new Map()
  };
}

function sendUnresolvedPreviewResult(worker: FakeWorker, targetId: string, requestId: string) {
  act(() => {
    for (const listener of worker.listeners['message'] ?? []) {
      listener({
        data: {
          type: 'preview:result',
          targetId,
          requestId,
          schema: {
            schemaVersion: 1,
            kind: 'typeAlias',
            targetId,
            title: targetId,
            status: 'unsupported',
            fields: [],
            unsupportedFeatures: ['unresolved-reference:NormalizedString']
          }
        }
      });
    }
  });
}

describe('CodegenProvider retry-budget exhaustion instrumentation', () => {
  it('emits exactly one hydrationRetryExhausted error record once beginRetryRound is exhausted, keeps retries-remaining at 0, and throws no exception out of the handler', () => {
    const emitted: TelemetryRecord[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('error'); // error records always clear regardless of threshold

    usePreviewStore.getState().resetPreviewState();
    usePreviewStore.setState({
      selectedTargetId: 'Scheme',
      selectedTarget: { id: 'Scheme', namespace: 'fpml.consolidated.confirmation', name: 'Scheme', kind: 'data' }
    });

    render(
      <WorkspaceStateContext.Provider value={wsState('ws-exhaust')}>
        <CodegenProvider>
          <div />
        </CodegenProvider>
      </WorkspaceStateContext.Provider>
    );

    const worker = FakeWorker.instances[0]!;
    const generateMsg = worker.posted.find((m) => m.type === 'preview:generate' && m.targetId === 'Scheme');
    expect(generateMsg).toBeDefined();

    // Spend the full retry budget: MAX_HYDRATION_RETRIES_PER_TARGET rounds of
    // an unresolved reference each spend one beginRetryRound attempt.
    for (let i = 0; i < MAX_HYDRATION_RETRIES_PER_TARGET; i++) {
      expect(() => sendUnresolvedPreviewResult(worker, 'Scheme', generateMsg.requestId)).not.toThrow();
    }
    expect(usePreviewStore.getState().hydrationRetriesRemaining['Scheme']).toBe(0);
    expect(emitted).toEqual([]); // budget not yet exhausted — canRetry was still true every round above

    // One more round: beginRetryRound now returns false — this is the
    // exhaustion branch under test.
    expect(() => sendUnresolvedPreviewResult(worker, 'Scheme', generateMsg.requestId)).not.toThrow();

    expect(emitted).toEqual([
      expect.objectContaining({
        op: 'hydrationRetryExhausted',
        level: 'error',
        signature: 'RetryExhaustedError',
        context: { attempts: MAX_HYDRATION_RETRIES_PER_TARGET }
      })
    ]);
    // Unchanged observable UX: falls through to setHydrationRetriesRemaining(targetId, 0).
    expect(usePreviewStore.getState().hydrationRetriesRemaining['Scheme']).toBe(0);

    // A further exhausted round emits again (not deduped) but still doesn't throw.
    expect(() => sendUnresolvedPreviewResult(worker, 'Scheme', generateMsg.requestId)).not.toThrow();
    expect(emitted.length).toBe(2);
  });
});
