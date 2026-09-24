// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Capture,
  addInstrumentationSink,
  configureInstrumentation,
  emitRecord,
  instrumentationConfigFromEnv,
  resetInstrumentationForTests,
  withInstrumentation,
  type TelemetryRecord
} from '../src/index.js';

afterEach(() => resetInstrumentationForTests());

describe('instrumentation configuration', () => {
  it('parses a shared level, operation list, and timing-only mode', () => {
    expect(
      instrumentationConfigFromEnv({
        INSTRUMENTATION_LEVEL: 'trace',
        INSTRUMENTATION_OPS: 'onRequestPost, fetchCuratedNamespace',
        INSTRUMENTATION_TIMING_ONLY: 'true'
      })
    ).toEqual({
      level: 'trace',
      operations: ['onRequestPost', 'fetchCuratedNamespace'],
      timingOnly: true
    });
    expect(instrumentationConfigFromEnv({ INSTRUMENTATION_LEVEL: 'invalid' }).level).toBe('info');
  });

  it('skips timing and capture for operations outside the configured list', () => {
    const emitted: TelemetryRecord[] = [];
    const sanitize = vi.fn((value: unknown) => value);
    configureInstrumentation((record) => emitted.push(record), undefined, {
      level: 'trace',
      operations: ['wanted']
    });
    const now = vi.spyOn(performance, 'now');
    withInstrumentation(() => 1, { op: 'other', level: 'trace', capture: Capture.Output, sanitize })();
    expect(now).not.toHaveBeenCalled();
    expect(sanitize).not.toHaveBeenCalled();
    expect(emitted).toEqual([]);
    now.mockRestore();
  });

  it('filters direct records while retaining namespace notifications', () => {
    const emitted: TelemetryRecord[] = [];
    const notified: TelemetryRecord[] = [];
    configureInstrumentation((record) => emitted.push(record), undefined, { operations: ['wanted'] });
    addInstrumentationSink((record) => notified.push(record));

    emitRecord({ op: 'other', level: 'error', captured: 0, ts: 1 });
    emitRecord({ op: 'notification', level: 'info', captured: 0, namespace: 'studio', ts: 2 });
    emitRecord({ op: 'wanted', level: 'info', captured: 0, ts: 3 });

    expect(emitted.map((record) => record.op)).toEqual(['wanted']);
    expect(notified.map((record) => record.op)).toEqual(['notification', 'wanted']);
  });

  it('skips timing when a runtime disables instrumentation', () => {
    const emitted: TelemetryRecord[] = [];
    configureInstrumentation(
      (record) => emitted.push(record),
      () => false,
      { level: 'trace' }
    );
    const now = vi.spyOn(performance, 'now');
    expect(withInstrumentation(() => 7, { op: 'wanted', level: 'trace' })()).toBe(7);
    expect(now).not.toHaveBeenCalled();
    expect(emitted).toEqual([]);
    now.mockRestore();
  });

  it('records elapsed time without invoking payload sanitizers in timing-only mode', () => {
    const emitted: TelemetryRecord[] = [];
    const sanitize = vi.fn((value: unknown) => value);
    configureInstrumentation((record) => emitted.push(record), undefined, {
      level: 'trace',
      timingOnly: true
    });
    withInstrumentation(() => 'model contents', {
      op: 'wanted',
      level: 'trace',
      capture: Capture.Output,
      sanitize
    })();
    expect(sanitize).not.toHaveBeenCalled();
    expect(emitted[0]).toMatchObject({ op: 'wanted', captured: 0 });
    expect(emitted[0]?.durationMs).toBeGreaterThanOrEqual(0);
    expect(emitted[0]).not.toHaveProperty('output');

    emitRecord({ op: 'manual', level: 'info', captured: Capture.Input, input: 'model contents', ts: 1 });
    expect(emitted[1]).not.toHaveProperty('input');
  });
});
