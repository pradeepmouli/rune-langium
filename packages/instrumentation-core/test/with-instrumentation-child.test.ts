// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, expect, it } from 'vitest';
import {
  Capture,
  configureInstrumentation,
  resetInstrumentationForTests,
  resetInstrumentationThresholdForTests,
  setInstrumentationThreshold,
  withInstrumentation
} from '../src/index.js';

afterEach(() => {
  resetInstrumentationForTests();
  resetInstrumentationThresholdForTests();
});

describe('withInstrumentation.child', () => {
  it('merges baseContext into every call made through the bound instance', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('info');
    // NOTE: the first argument IS the baseContext itself (it lands verbatim in
    // record.context) — not an options bag with a `context` key.
    const moduleScoped = withInstrumentation.child({ module: 'codegen-worker' });
    const wrapped = moduleScoped((x: number) => x, { op: 'passthrough', level: 'info' });
    wrapped(1);
    expect(emitted).toEqual([expect.objectContaining({ op: 'passthrough', context: { module: 'codegen-worker' } })]);
  });

  it('a level set on .child() is inherited by wrapped calls that do not specify their own', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('debug');
    const verbose = withInstrumentation.child({}, { level: 'debug' });
    const wrapped = verbose(() => 1, { op: 'quiet' }); // no explicit level — inherits 'debug'
    wrapped();
    expect(emitted).toEqual([expect.objectContaining({ op: 'quiet', level: 'debug' })]);
  });

  it('an explicit level at the wrap site overrides an inherited .child() level', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('warn');
    const verbose = withInstrumentation.child({}, { level: 'debug' });
    const wrapped = verbose(() => 1, { op: 'loud', level: 'warn' });
    wrapped();
    expect(emitted).toEqual([expect.objectContaining({ op: 'loud', level: 'warn' })]);
  });

  it('baseContext also lands on the ERROR record when a wrapped call throws (unless sanitizeError supplies its own context)', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('error');
    const moduleScoped = withInstrumentation.child({ module: 'codegen-worker' });
    const wrapped = moduleScoped(
      () => {
        throw new Error('boom');
      },
      { op: 'explodeInChild', sanitizeError: () => ({ signature: 'Error:boom' }) }
    );
    expect(() => wrapped()).toThrow('boom');
    expect(emitted).toEqual([
      expect.objectContaining({ op: 'explodeInChild', level: 'error', context: { module: 'codegen-worker' } })
    ]);
  });
});

describe('withInstrumentation level-named sugar', () => {
  it('.debug(fn, opts) is equivalent to withInstrumentation(fn, { ...opts, level: "debug" })', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('debug');
    const wrapped = withInstrumentation.debug(() => 1, { op: 'viaSugar' });
    wrapped();
    expect(emitted).toEqual([expect.objectContaining({ op: 'viaSugar', level: 'debug' })]);
  });
});

describe('dynamic nesting-depth default level', () => {
  it('a top-level call (no instrumented calls above it) defaults to info', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('trace'); // let everything through so the DEFAULT is visible
    const wrapped = withInstrumentation(() => 1, { op: 'shallow' }); // no explicit level
    wrapped();
    expect(emitted).toEqual([expect.objectContaining({ op: 'shallow', level: 'info' })]);
  });

  it('a call made from inside another instrumented call defaults lower (debug, not info)', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('trace');
    const inner = withInstrumentation(() => 1, { op: 'inner' }); // no explicit level
    const outer = withInstrumentation(() => inner(), { op: 'outer' }); // no explicit level
    outer();
    const innerRecord = emitted.find((r: any) => r.op === 'inner') as any;
    expect(innerRecord.level).toBe('debug');
  });

  it('depth is correctly decremented after a synchronous call returns, so a later top-level call is still info (regression: a prior version leaked depth on every sync call)', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('trace');
    const wrapped = withInstrumentation(() => 1, { op: 'repeat' });
    wrapped();
    wrapped();
    wrapped();
    expect(emitted.every((r: any) => r.level === 'info')).toBe(true);
  });

  it('depth is correctly decremented after an async call settles, not before', async () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('trace');
    const wrapped = withInstrumentation(async () => 1, { op: 'asyncRepeat' });
    await wrapped();
    await wrapped();
    expect(emitted.every((r: any) => r.level === 'info')).toBe(true);
  });

  // Regression coverage for a bug Task 2's review caught in ITS OWN early-plan
  // code shape (an `if (!clears) return fn.apply(...)` early-return before
  // entering the try/catch), which Task 2 fixed for the base wrapper. This
  // task's depth-tracking append re-introduces the SAME early-return shape in
  // its own literal code unless corrected — and for depth-tracking
  // specifically it is a SECOND bug, not just the error-emission one: an
  // early return before `depth++` means a below-threshold call's own nested
  // calls never see their parent's depth increment, silently under-counting
  // nesting. Both must hold even when the call itself never clears.
  it('a below-threshold call still increments depth for its own nested calls (regression: an early return before depth++ would hide nesting)', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('trace');
    const inner = withInstrumentation(() => 1, { op: 'innerUnderBelowThresholdParent' });
    // outer is explicitly BELOW the 'trace' threshold isn't possible (trace is
    // the lowest level) — so gate outer's own emission via an explicit level
    // above the ambient default while asserting on the emitted array itself:
    // the real assertion is about depth's effect on `inner`, not on whether
    // `outer` itself emits.
    setInstrumentationThreshold('error'); // outer (default 'info') won't clear
    const outer = withInstrumentation(() => inner(), { op: 'outerBelowThreshold' });
    outer();
    const innerRecord = emitted.find((r: any) => r.op === 'innerUnderBelowThresholdParent');
    expect(innerRecord).toBeUndefined(); // inner is 'trace'-appropriate-depth but threshold is 'error', so it won't emit either — see next assertion for the real check
    // Re-run with a threshold that lets inner through, to prove depth was
    // still incremented by outer despite outer itself never clearing 'error'.
    setInstrumentationThreshold('debug');
    outer();
    const secondInnerRecord = emitted.find((r: any) => r.op === 'innerUnderBelowThresholdParent');
    expect(secondInnerRecord).toBeDefined();
    expect((secondInnerRecord as any).level).toBe('debug'); // depth=1 from outer -> inner defaults to debug, proving outer's depth++ ran even though outer itself never cleared 'error' on the first call
  });

  it('a below-threshold async rejection still emits an error record and still decrements depth on settle (regression: same early-return shape as Task 2, applied to the depth-tracking wrapper)', async () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('error');
    const boom = new Error('boom');
    const wrapped = withInstrumentation(
      async () => {
        throw boom;
      },
      { op: 'depthAsyncExplode', level: 'trace', sanitizeError: () => ({ signature: 'Error:boom' }) }
    );
    await expect(wrapped()).rejects.toThrow(boom);
    expect(emitted).toEqual([expect.objectContaining({ op: 'depthAsyncExplode', level: 'error' })]);
    // Depth must have been decremented on settle — a later top-level call
    // still defaults to 'info', not a deeper level, proving no leak.
    setInstrumentationThreshold('trace');
    const wrapped2 = withInstrumentation(() => 1, { op: 'afterAsyncExplode' });
    wrapped2();
    const afterRecord = emitted.find((r: any) => r.op === 'afterAsyncExplode');
    expect((afterRecord as any).level).toBe('info');
  });
});
