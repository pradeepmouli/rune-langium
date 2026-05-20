// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, expect, it, vi } from 'vitest';

import { isWorkerGlobalScope } from '../../src/workers/runtime-guards.js';

describe('isWorkerGlobalScope', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false when `self` is undefined (Node / SSR)', () => {
    vi.stubGlobal('self', undefined);
    expect(isWorkerGlobalScope()).toBe(false);
  });

  it('returns false on a browser-main-thread `self` (window-like, no WorkerGlobalScope, no importScripts)', () => {
    // Mirrors the prod regression from PR #214: `self === window` so
    // `postMessage` exists, but neither `WorkerGlobalScope` instanceof nor
    // `importScripts` is present.
    vi.stubGlobal('self', { postMessage: () => undefined, addEventListener: () => undefined });
    expect(isWorkerGlobalScope()).toBe(false);
  });

  it('returns true when `self instanceof WorkerGlobalScope`', () => {
    class FakeWorkerGlobalScope {}
    const workerSelf = new FakeWorkerGlobalScope();
    vi.stubGlobal('WorkerGlobalScope', FakeWorkerGlobalScope);
    vi.stubGlobal('self', workerSelf);
    expect(isWorkerGlobalScope()).toBe(true);
  });

  it('returns true via the `importScripts` fallback when WorkerGlobalScope is unavailable', () => {
    // Test envs (jsdom/node) don't expose a `WorkerGlobalScope` constructor,
    // but a real DedicatedWorkerGlobalScope always has `importScripts`.
    vi.stubGlobal('WorkerGlobalScope', undefined);
    vi.stubGlobal('self', { importScripts: () => undefined });
    expect(isWorkerGlobalScope()).toBe(true);
  });
});
