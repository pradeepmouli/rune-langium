// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, expect, it } from 'vitest';
import {
  addInstrumentationSink,
  configureInstrumentation,
  resetInstrumentationForTests,
  setInstrumentationThreshold,
  withInstrumentation
} from '../src/index.js';

afterEach(() => {
  resetInstrumentationForTests();
});

describe('addInstrumentationSink', () => {
  it('an additional sink receives records alongside the primary configureInstrumentation sink', () => {
    const primary: unknown[] = [];
    const secondary: unknown[] = [];
    configureInstrumentation((r) => primary.push(r));
    addInstrumentationSink((r) => secondary.push(r));
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 'ok', { op: 'test', level: 'info' });
    wrapped();
    expect(primary).toEqual([expect.objectContaining({ op: 'test' })]);
    expect(secondary).toEqual([expect.objectContaining({ op: 'test' })]);
  });

  it('multiple additional sinks all receive the same record', () => {
    const a: unknown[] = [];
    const b: unknown[] = [];
    configureInstrumentation(() => {});
    addInstrumentationSink((r) => a.push(r));
    addInstrumentationSink((r) => b.push(r));
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 'ok', { op: 'test', level: 'info' });
    wrapped();
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('the returned unregister function stops future delivery to that sink', () => {
    const received: unknown[] = [];
    configureInstrumentation(() => {});
    const unregister = addInstrumentationSink((r) => received.push(r));
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 'ok', { op: 'test', level: 'info' });
    wrapped();
    expect(received).toHaveLength(1);
    unregister();
    wrapped();
    expect(received).toHaveLength(1);
  });

  it('resetInstrumentationForTests clears all additional sinks between tests', () => {
    configureInstrumentation(() => {});
    addInstrumentationSink(() => {
      throw new Error('this sink should never fire after reset');
    });
    resetInstrumentationForTests();
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 'ok', { op: 'test', level: 'info' });
    expect(() => wrapped()).not.toThrow();
  });

  it('a throwing additional sink does not prevent a later-registered sink from receiving the record', () => {
    const received: unknown[] = [];
    configureInstrumentation(() => {});
    addInstrumentationSink(() => {
      throw new Error('first sink blows up');
    });
    addInstrumentationSink((r) => received.push(r));
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 'ok', { op: 'test', level: 'info' });
    expect(() => wrapped()).not.toThrow();
    expect(received).toEqual([expect.objectContaining({ op: 'test' })]);
  });

  it('a throwing sink does not cause withInstrumentation to throw or change a successful call result', () => {
    configureInstrumentation(() => {
      throw new Error('primary sink blows up');
    });
    addInstrumentationSink(() => {
      throw new Error('additional sink blows up');
    });
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 'real result', { op: 'test', level: 'info' });
    expect(wrapped()).toBe('real result');
  });

  // Regression coverage for the notify-only fast path (runNotifyOnly) — the
  // one namespace-tagged calls actually take in production (IS_PROD is a
  // build-time constant we can't flip in a test, but `isEnabled: () =>
  // false` reaches the exact same code path). It previously hardcoded
  // `durationMs: 0` regardless of real elapsed time, which silently
  // defeated any namespace-tagged span whose whole purpose was measuring
  // latency (caught via PR review on rune-langium#486's connect-phase
  // instrumentation).
  it('the notify-only fast path reports real elapsed time, not a hardcoded 0', async () => {
    const received: { durationMs?: number }[] = [];
    configureInstrumentation(
      () => {},
      () => false
    );
    addInstrumentationSink((r) => received.push(r));
    const wrapped = withInstrumentation(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return 'ok';
      },
      { op: 'slowNamespacedCall', namespace: 'lsp' }
    );
    await wrapped();
    expect(received).toHaveLength(1);
    expect(received[0].durationMs).toBeGreaterThan(0);
  });

  it('the notify-only fast path reports real elapsed time for a sync call too', () => {
    const received: { durationMs?: number }[] = [];
    configureInstrumentation(
      () => {},
      () => false
    );
    addInstrumentationSink((r) => received.push(r));
    const wrapped = withInstrumentation(
      () => {
        // Busy-wait a few ms so there is real elapsed time to measure —
        // Date.now()/performance.now() aren't frozen in this test env
        // (that freeze is a Cloudflare Workers isolate behavior, not a
        // browser/Node one; see reference_cloudflare_pages_deploy_mechanism
        // memory for where that DOES matter, server-side).
        const until = performance.now() + 5;
        while (performance.now() < until) {
          /* spin */
        }
        return 'ok';
      },
      { op: 'slowSyncNamespacedCall', namespace: 'lsp' }
    );
    wrapped();
    expect(received).toHaveLength(1);
    expect(received[0].durationMs).toBeGreaterThan(0);
  });

  // Regression coverage for emitError's durationMs — previously always
  // undefined everywhere in the module, including the notify-only fast
  // path. A 100%-sampled failure span with no duration can't distinguish
  // an immediate rejection from one that only failed after a real
  // connection-establish timeout, which defeats exactly the latency
  // investigation rune-langium#486 exists for.
  it('the notify-only fast path reports real elapsed time on a rejected async call too', async () => {
    const received: { durationMs?: number }[] = [];
    configureInstrumentation(
      () => {},
      () => false
    );
    addInstrumentationSink((r) => received.push(r));
    const wrapped = withInstrumentation(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        throw new Error('connect failed');
      },
      { op: 'failingNamespacedCall', namespace: 'lsp' }
    );
    await expect(wrapped()).rejects.toThrow('connect failed');
    expect(received).toHaveLength(1);
    expect(received[0].durationMs).toBeGreaterThan(0);
  });

  it('the full wrapper path (threshold-gated, non-prod) also reports real elapsed time on a thrown error', () => {
    const received: { durationMs?: number }[] = [];
    configureInstrumentation((r) => received.push(r));
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(
      () => {
        const until = performance.now() + 5;
        while (performance.now() < until) {
          /* spin */
        }
        throw new Error('boom');
      },
      { op: 'failingCall' }
    );
    expect(() => wrapped()).toThrow('boom');
    expect(received).toHaveLength(1);
    expect(received[0].durationMs).toBeGreaterThan(0);
  });
});
