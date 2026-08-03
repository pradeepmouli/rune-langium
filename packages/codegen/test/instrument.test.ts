// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, expect, it } from 'vitest';
import {
  configureInstrumentation,
  resetInstrumentationForTests,
  resetInstrumentationThresholdForTests,
  setInstrumentationThreshold
} from '@rune-langium/instrumentation-core';
import { debug } from '../src/instrument.js';

afterEach(() => {
  resetInstrumentationForTests();
  resetInstrumentationThresholdForTests();
});

describe('@debug() method decorator', () => {
  it('wraps a class method so it emits through the instrumentation pipe and still returns normally', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('debug');
    class Example {
      @debug()
      double(x: number): number {
        return x * 2;
      }
    }
    const result = new Example().double(21);
    expect(result).toBe(42);
    expect(emitted).toEqual([expect.objectContaining({ op: 'double', level: 'debug' })]);
  });

  it('propagates a thrown error from the decorated method and still emits an error record', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    setInstrumentationThreshold('error');
    class Example {
      @debug()
      explode(): void {
        throw new Error('boom');
      }
    }
    expect(() => new Example().explode()).toThrow('boom');
    expect(emitted).toEqual([expect.objectContaining({ op: 'explode', level: 'error' })]);
  });
});
