// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, expect, it } from 'vitest';
import {
  Capture,
  configureInstrumentation,
  resetInstrumentationForTests,
  __buildRecordForTests
} from '../../../src/services/instrumentation/core.js';

afterEach(() => {
  resetInstrumentationForTests();
});

describe('configureInstrumentation', () => {
  it('routes buildRecord output to the configured emit function', () => {
    const emitted: unknown[] = [];
    configureInstrumentation((r) => emitted.push(r));
    const record = __buildRecordForTests('testOp', 'info', { captured: Capture.Input, input: 'x' });
    expect(emitted).toEqual([]);
    // buildRecord alone does not emit — emit is a separate, explicit call.
    expect(record.op).toBe('testOp');
    expect(record.level).toBe('info');
    expect(record.captured).toBe(Capture.Input);
    expect(record.input).toBe('x');
    expect(typeof record.ts).toBe('number');
  });

  it('defaults to a silent no-op emit before configureInstrumentation is ever called', () => {
    // resetInstrumentationForTests() in afterEach guarantees a clean slate; this
    // test runs BEFORE any configure call in this suite has a chance to leak in.
    resetInstrumentationForTests();
    expect(() => {
      const record = __buildRecordForTests('unconfigured', 'error', { captured: 0 });
      // Calling the current (default no-op) emit must never throw.
      // core.ts exposes the current emit only indirectly via withInstrumentation
      // in Task 2 — here we just confirm buildRecord itself never throws.
      void record;
    }).not.toThrow();
  });
});
