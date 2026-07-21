// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useState } from 'react';

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
});

import { CodegenProvider } from '../../../src/shell/providers/CodegenProvider.js';
import { WorkspaceStateContext, type WorkspaceState } from '../../../src/shell/providers/workspace-context.js';
import { useInstanceStore } from '../../../src/store/instance-store.js';
import { usePreviewStore } from '../../../src/store/preview-store.js';
import { useOutputStore } from '../../../src/store/output-store.js';

function wsState(id: string): WorkspaceState {
  return {
    workspaceId: id,
    workspaceKind: 'browser-only',
    workspaceName: id,
    fileCount: 1,
    files: [{ name: 'a.rosetta', path: 'a.rosetta', content: 'namespace a', dirty: false }],
    models: [],
    parsedModels: [],
    deferredExports: [],
    parseErrors: new Map()
  };
}

describe('CodegenProvider', () => {
  it('creates exactly ONE worker and re-posts setFiles across a workspace switch (single owner, P2)', () => {
    function Host() {
      const [id, setId] = useState('ws-A');
      return (
        <WorkspaceStateContext.Provider value={wsState(id)}>
          <button onClick={() => setId('ws-B')}>switch</button>
          <CodegenProvider>
            <div />
          </CodegenProvider>
        </WorkspaceStateContext.Provider>
      );
    }
    render(<Host />);
    expect(FakeWorker.instances.length).toBe(1);
    const before = FakeWorker.instances[0].posted.filter((m) => m.type === 'codegen:setFiles').length;
    act(() => document.querySelector('button')!.click());
    expect(FakeWorker.instances.length).toBe(1); // NOT re-created on switch
    const after = FakeWorker.instances[0].posted.filter((m) => m.type === 'codegen:setFiles').length;
    expect(after).toBeGreaterThan(before); // re-posted on model change
  });

  it('routes an instance:generateSchemaResult matching an instance-store pending schema request to instance-store, on its own channel from usePreviewStore (finding #6/#7)', () => {
    render(
      <WorkspaceStateContext.Provider value={wsState('ws-A')}>
        <CodegenProvider>
          <div />
        </CodegenProvider>
      </WorkspaceStateContext.Provider>
    );

    const worker = FakeWorker.instances[0]!;
    act(() => {
      useInstanceStore.getState().dispatchGenerateSchema('test.instance.Party');
    });
    const schemaRequest = worker.posted.find(
      (m) => m.type === 'instance:generateSchema' && m.typeFqn === 'test.instance.Party'
    );
    expect(schemaRequest?.requestId.startsWith('schema:')).toBe(true);
    // Confirms this request never touches preview:generate at all — the
    // whole point of finding #6/#7's fix.
    expect(worker.posted.some((m) => m.type === 'preview:generate' && m.targetId === 'test.instance.Party')).toBe(
      false
    );

    const schema = {
      schemaVersion: 1,
      targetId: 'test.instance.Party',
      title: 'Party',
      status: 'ready',
      fields: []
    };

    act(() => {
      for (const listener of worker.listeners['message'] ?? []) {
        listener({
          data: { type: 'instance:generateSchemaResult', requestId: schemaRequest.requestId, schema }
        });
      }
    });

    expect(useInstanceStore.getState().schemas.get('test.instance.Party')).toEqual(schema);
    expect(usePreviewStore.getState().schemas.has('test.instance.Party')).toBe(false);
  });

  it('routes an instance:generateSchemaStale response to instance-store schemaErrors (finding #7)', () => {
    useInstanceStore.setState({ schemaErrors: new Map() });
    render(
      <WorkspaceStateContext.Provider value={wsState('ws-A')}>
        <CodegenProvider>
          <div />
        </CodegenProvider>
      </WorkspaceStateContext.Provider>
    );

    const worker = FakeWorker.instances[0]!;
    act(() => {
      useInstanceStore.getState().dispatchGenerateSchema('test.instance.Unsupported');
    });
    const schemaRequest = worker.posted.find(
      (m) => m.type === 'instance:generateSchema' && m.typeFqn === 'test.instance.Unsupported'
    );

    act(() => {
      for (const listener of worker.listeners['message'] ?? []) {
        listener({
          data: {
            type: 'instance:generateSchemaStale',
            requestId: schemaRequest.requestId,
            reason: 'unsupported-target',
            message: 'No form preview schema is available for test.instance.Unsupported.'
          }
        });
      }
    });

    expect(useInstanceStore.getState().schemaErrors.get('test.instance.Unsupported')).toEqual({
      reason: 'unsupported-target',
      message: 'No form preview schema is available for test.instance.Unsupported.'
    });
  });

  it('still routes an ordinary preview:result matching currentPreviewRequestIdRef to usePreviewStore', () => {
    usePreviewStore.getState().resetPreviewState();
    usePreviewStore.setState({
      selectedTargetId: 'test.preview.Trade',
      selectedTarget: { id: 'test.preview.Trade', namespace: 'test.preview', name: 'Trade', kind: 'data' }
    });

    render(
      <WorkspaceStateContext.Provider value={wsState('ws-B')}>
        <CodegenProvider>
          <div />
        </CodegenProvider>
      </WorkspaceStateContext.Provider>
    );

    const worker = FakeWorker.instances[0]!;
    const previewRequest = worker.posted.find(
      (m) => m.type === 'preview:generate' && m.targetId === 'test.preview.Trade'
    );
    expect(previewRequest).toBeDefined();

    const schema = {
      schemaVersion: 1,
      targetId: 'test.preview.Trade',
      title: 'Trade',
      status: 'ready',
      fields: []
    };

    act(() => {
      for (const listener of worker.listeners['message'] ?? []) {
        listener({
          data: { type: 'preview:result', targetId: schema.targetId, requestId: previewRequest.requestId, schema }
        });
      }
    });

    expect(usePreviewStore.getState().schemas.get('test.preview.Trade')).toEqual(schema);
  });

  it('logs an op-log error when the preview worker crashes, not just the preview panel status', () => {
    useOutputStore.setState({ lines: [] });
    render(
      <WorkspaceStateContext.Provider value={wsState('ws-crash')}>
        <CodegenProvider>
          <div />
        </CodegenProvider>
      </WorkspaceStateContext.Provider>
    );

    const worker = FakeWorker.instances[0]!;
    act(() => {
      for (const listener of worker.listeners['error'] ?? []) {
        listener({ type: 'error', message: 'boom' });
      }
    });

    const entry = useOutputStore.getState().lines.find((l) => l.op === 'preview');
    expect(entry).toBeDefined();
    expect(entry?.severity).toBe('error');
    expect(entry?.text).toContain('Preview worker crashed');
  });

  it('logs both the preview and codegen op-log entries for a single worker crash, since both listeners share one worker (Codex P2)', () => {
    // The shared codegenWorker has two independent 'error' listeners (the
    // preview channel's handleWorkerFailure and the codegen channel's
    // handleCodegenWorkerError) — a single native crash fires both. Both
    // op-log entries are legitimate (distinct channels), but only ONE
    // destructive toast should fire; handlePreviewWorkerFailure's `toast`
    // option is what prevents the duplicate (not directly observable here
    // since these tests don't wrap a StudioToastProvider — showToast is a
    // no-op — so this pins the op-log side of the fix).
    useOutputStore.setState({ lines: [] });
    render(
      <WorkspaceStateContext.Provider value={wsState('ws-crash-both')}>
        <CodegenProvider>
          <div />
        </CodegenProvider>
      </WorkspaceStateContext.Provider>
    );

    const worker = FakeWorker.instances[0]!;
    act(() => {
      for (const listener of worker.listeners['error'] ?? []) {
        listener({ type: 'error', message: 'boom' });
      }
    });

    const lines = useOutputStore.getState().lines;
    expect(lines.find((l) => l.op === 'preview')).toBeDefined();
    expect(lines.find((l) => l.text.includes('worker crashed'))).toBeDefined();
  });
});
