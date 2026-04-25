// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T016 — multi-tab BroadcastChannel ownership tests.
 * Two tabs are simulated by constructing two WorkspaceOwnership instances
 * sharing the same channel name (BroadcastChannel in jsdom is per-realm,
 * so we use a small in-memory polyfill that round-trips messages).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkspaceOwnership } from '../../src/services/multi-tab-broadcast.js';

class FakeBroadcastChannel extends EventTarget {
  static channels = new Map<string, Set<FakeBroadcastChannel>>();
  constructor(public name: string) {
    super();
    if (!FakeBroadcastChannel.channels.has(name)) {
      FakeBroadcastChannel.channels.set(name, new Set());
    }
    FakeBroadcastChannel.channels.get(name)!.add(this);
  }
  postMessage(data: unknown) {
    const peers = FakeBroadcastChannel.channels.get(this.name);
    if (!peers) return;
    queueMicrotask(() => {
      for (const peer of peers) {
        if (peer === this) continue;
        peer.dispatchEvent(new MessageEvent('message', { data }));
      }
    });
  }
  close() {
    FakeBroadcastChannel.channels.get(this.name)?.delete(this);
  }
}

beforeEach(() => {
  FakeBroadcastChannel.channels.clear();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).BroadcastChannel = FakeBroadcastChannel;
});
afterEach(() => {
  FakeBroadcastChannel.channels.clear();
});

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('WorkspaceOwnership — claim, observe, takeover (T016)', () => {
  it('first tab to claim becomes the owner', async () => {
    const tabA = new WorkspaceOwnership('tab-a');
    const ok = await tabA.claim('ws-1');
    expect(ok).toBe(true);
    expect(tabA.isOwner('ws-1')).toBe(true);
  });

  it('second tab observes the claim and becomes read-only', async () => {
    const tabA = new WorkspaceOwnership('tab-a');
    const tabB = new WorkspaceOwnership('tab-b');

    expect(await tabA.claim('ws-1')).toBe(true);

    // Tab B tries to claim — should be rejected because tab A advertises ownership.
    const okB = await tabB.claim('ws-1', { timeoutMs: 50 });
    expect(okB).toBe(false);
    expect(tabB.isOwner('ws-1')).toBe(false);
    expect(tabB.peerOwner('ws-1')).toBe('tab-a');
  });

  it('takeover transfers ownership and the previous owner sees it', async () => {
    const tabA = new WorkspaceOwnership('tab-a');
    const tabB = new WorkspaceOwnership('tab-b');

    let aLost = false;
    tabA.onOwnershipLost('ws-1', () => {
      aLost = true;
    });

    expect(await tabA.claim('ws-1')).toBe(true);

    // Tab B takes over.
    await tabB.takeover('ws-1');
    await flushMicrotasks();

    expect(tabB.isOwner('ws-1')).toBe(true);
    expect(aLost).toBe(true);
  });

  it('release lets the next claimer take over without conflict', async () => {
    const tabA = new WorkspaceOwnership('tab-a');
    const tabB = new WorkspaceOwnership('tab-b');

    expect(await tabA.claim('ws-1')).toBe(true);
    tabA.release('ws-1');
    await flushMicrotasks();

    expect(await tabB.claim('ws-1')).toBe(true);
    expect(tabB.isOwner('ws-1')).toBe(true);
  });
});
