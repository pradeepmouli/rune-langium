// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Capture,
  configureInstrumentation,
  resetInstrumentationForTests,
  setInstrumentationThreshold,
  withInstrumentation
} from '../../../src/services/instrumentation/core.js';

afterEach(() => {
  resetInstrumentationForTests();
});

describe('withInstrumentation', () => {
  it('below-threshold calls skip all instrumentation work and just run fn', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('error'); // only errors clear
    const sanitize = vi.fn((v: unknown) => v);
    const wrapped = withInstrumentation((x: number) => x + 1, {
      op: 'addOne',
      level: 'info',
      capture: Capture.Input | Capture.Output,
      sanitize
    });
    expect(wrapped(41)).toBe(42);
    expect(emitted).toEqual([]);
    expect(sanitize).not.toHaveBeenCalled();
  });

  it('at-or-above-threshold success calls sanitize and emit for captured parts', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation((x: number) => x + 1, {
      op: 'addOne',
      level: 'info',
      capture: Capture.Input | Capture.Output,
      sanitize: (v) => v
    });
    expect(wrapped(41)).toBe(42);
    expect(emitted).toEqual([
      expect.objectContaining({
        op: 'addOne',
        level: 'info',
        captured: Capture.Input | Capture.Output,
        input: [41],
        output: 42
      })
    ]);
  });

  it('a thrown error ALWAYS emits an error-level record regardless of threshold, then rethrows unchanged', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('error'); // even the strictest threshold
    const boom = new Error('boom');
    const wrapped = withInstrumentation(
      () => {
        throw boom;
      },
      { op: 'explode', level: 'trace', sanitizeError: (e) => ({ signature: 'Error:boom', context: undefined }) }
    );
    expect(() => wrapped()).toThrow(boom);
    expect(emitted).toEqual([expect.objectContaining({ op: 'explode', level: 'error', signature: 'Error:boom' })]);
  });

  it('never swallows — there is no way to make withInstrumentation NOT rethrow', () => {
    configureInstrumentation(() => {});
    const wrapped = withInstrumentation(
      () => {
        throw new Error('always propagates');
      },
      { op: 'x', sanitizeError: () => ({ signature: 'x' }) }
    );
    expect(() => wrapped()).toThrow('always propagates');
  });

  it('op defaults to fn.name when not given', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('info');
    function myNamedFunction(): void {}
    const wrapped = withInstrumentation(myNamedFunction, { level: 'info' });
    wrapped();
    expect(emitted).toEqual([expect.objectContaining({ op: 'myNamedFunction' })]);
  });

  it('an above-threshold call through the default (pre-configuration) no-op sink never throws', () => {
    resetInstrumentationForTests(); // guarantee the no-op sink, not a leaked emit from a prior test
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 7, { op: 'unconfigured', level: 'info' });
    expect(wrapped()).toBe(7); // emit path runs, silently dropped — the design's "silent no-op" invariant
  });
});
