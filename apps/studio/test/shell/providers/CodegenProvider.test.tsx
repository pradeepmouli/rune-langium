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
  constructor() { FakeWorker.instances.push(this); }
  postMessage(m: any) { this.posted.push(m); }
  addEventListener(t: string, cb: Function) { (this.listeners[t] ||= []).push(cb); }
  removeEventListener(t: string, cb: Function) { this.listeners[t] = (this.listeners[t] || []).filter((f) => f !== cb); }
  terminate() { this.terminated = true; }
}

beforeEach(() => {
  FakeWorker.instances = [];
  window.__runeStudioTestApi = { createCodegenWorker: () => new FakeWorker() as unknown as Worker };
});

import { CodegenProvider } from '../../../src/shell/providers/CodegenProvider.js';
import { WorkspaceStateContext, type WorkspaceState } from '../../../src/shell/providers/workspace-context.js';

function wsState(id: string): WorkspaceState {
  return { workspaceId: id, workspaceKind: 'browser-only', workspaceName: id, fileCount: 1,
    files: [{ name: 'a.rosetta', path: 'a.rosetta', content: 'namespace a', dirty: false }],
    models: [], parsedModels: [], deferredExports: [] };
}

describe('CodegenProvider', () => {
  it('creates exactly ONE worker and re-posts setFiles across a workspace switch (single owner, P2)', () => {
    function Host() {
      const [id, setId] = useState('ws-A');
      return (
        <WorkspaceStateContext.Provider value={wsState(id)}>
          <button onClick={() => setId('ws-B')}>switch</button>
          <CodegenProvider><div /></CodegenProvider>
        </WorkspaceStateContext.Provider>
      );
    }
    render(<Host />);
    expect(FakeWorker.instances.length).toBe(1);
    const before = FakeWorker.instances[0].posted.filter((m) => m.type === 'codegen:setFiles').length;
    act(() => document.querySelector('button')!.click());
    expect(FakeWorker.instances.length).toBe(1);   // NOT re-created on switch
    const after = FakeWorker.instances[0].posted.filter((m) => m.type === 'codegen:setFiles').length;
    expect(after).toBeGreaterThan(before);          // re-posted on model change
  });
});
