// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T016 — multi-tab BroadcastChannel ownership tests.
 * Two tabs are simulated by constructing two WorkspaceOwnership instances
 * sharing the same channel name (BroadcastChannel in jsdom is per-realm,
 * so we use a small in-memory polyfill that round-trips messages).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

  it('two simultaneous claimers — exactly one wins via deterministic tiebreak', async () => {
    const tabA = new WorkspaceOwnership('tab-a');
    const tabB = new WorkspaceOwnership('tab-b');
    // Fire both claims without awaiting in between — the textbook race.
    const [a, b] = await Promise.all([tabA.claim('ws-x'), tabB.claim('ws-x')]);
    expect([a, b].filter(Boolean).length).toBe(1);
    // Smaller tabId ('tab-a' < 'tab-b') wins.
    expect(a).toBe(true);
    expect(b).toBe(false);
    expect(tabA.isOwner('ws-x')).toBe(true);
    expect(tabB.isOwner('ws-x')).toBe(false);
  });

  it('a takeover during a peer claim resolves that claim as denied', async () => {
    const tabA = new WorkspaceOwnership('tab-a');
    const tabB = new WorkspaceOwnership('tab-b');
    // tabB starts a claim and tabA fires takeover before B's window expires.
    const claimPromise = tabB.claim('ws-y', { timeoutMs: 1000 });
    await flushMicrotasks();
    await tabA.takeover('ws-y');
    const result = await claimPromise;
    expect(result).toBe(false);
    expect(tabB.peerOwner('ws-y')).toBe('tab-a');
  });

  it('callback exceptions in onOwnershipLost are isolated, not silently swallowed', async () => {
    const tabA = new WorkspaceOwnership('tab-a');
    const tabB = new WorkspaceOwnership('tab-b');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await tabA.claim('ws-z')).toBe(true);
    tabA.onOwnershipLost('ws-z', () => {
      throw new Error('boom from app code');
    });
    await tabB.takeover('ws-z');
    await flushMicrotasks();
    // Tab A still flipped to non-owner state…
    expect(tabA.isOwner('ws-z')).toBe(false);
    // …and the throwing callback was logged, not silently dropped.
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('drops messages from a future protocol version', async () => {
    const tabA = new WorkspaceOwnership('tab-a');
    expect(await tabA.claim('ws-fp')).toBe(true);
    // Inject a foreign-protocol claim — should be ignored, ownership unchanged.
    const channels = (
      globalThis as unknown as {
        BroadcastChannel: { channels: Map<string, Set<EventTarget>> };
      }
    ).BroadcastChannel.channels;
    const peers = channels.get('rune-studio:workspace-ownership');
    expect(peers).toBeDefined();
    for (const peer of peers!) {
      peer.dispatchEvent(
        new MessageEvent('message', {
          data: { proto: 99, type: 'takeover', wsId: 'ws-fp', tabId: 'malicious' }
        })
      );
    }
    await flushMicrotasks();
    expect(tabA.isOwner('ws-fp')).toBe(true);
  });
});
