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
});
