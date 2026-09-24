// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it, vi } from 'vitest';
import { installInstrumentationEdgeSink, withEdgeInstrumentation } from '../lib/instrumentation-sink.js';
import {
  Capture,
  resetInstrumentationForTests,
  resetInstrumentationThresholdForTests,
  setInstrumentationThreshold,
  withInstrumentation
} from '../../src/services/instrumentation/core.js';

describe('installInstrumentationEdgeSink', () => {
  it('logs a JSON.stringify of the record via console.log, enabled by env flag', () => {
    resetInstrumentationForTests();
    resetInstrumentationThresholdForTests();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    installInstrumentationEdgeSink({ INSTRUMENTATION_ENABLED: 'true' });
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 1, {
      op: 'edgeOp',
      level: 'info',
      capture: Capture.Output,
      sanitize: (v) => v
    });
    wrapped();
    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(logSpy.mock.calls[0]![0] as string);
    expect(parsed).toMatchObject({ op: 'edgeOp' });
    logSpy.mockRestore();
  });

  it('does nothing when INSTRUMENTATION_ENABLED is not set', () => {
    resetInstrumentationForTests();
    resetInstrumentationThresholdForTests();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    installInstrumentationEdgeSink({});
    const nowSpy = vi.spyOn(performance, 'now');
    const wrapped = withInstrumentation(() => 1, { op: 'edgeOp', level: 'info' });
    wrapped();
    expect(logSpy).not.toHaveBeenCalled();
    expect(nowSpy).not.toHaveBeenCalled();
    nowSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('configures trace timing spans by operation without logging captured payloads', () => {
    resetInstrumentationForTests();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    installInstrumentationEdgeSink({
      INSTRUMENTATION_ENABLED: 'true',
      INSTRUMENTATION_LEVEL: 'trace',
      INSTRUMENTATION_OPS: 'fetchCuratedManifest, fetchCuratedNamespace',
      INSTRUMENTATION_TIMING_ONLY: 'true'
    });
    withInstrumentation(() => 'secret', {
      op: 'fetchCuratedManifest',
      level: 'trace',
      capture: Capture.Output
    })();
    withInstrumentation(() => 1, { op: 'unrelatedOperation', level: 'trace' })();

    expect(logSpy).toHaveBeenCalledTimes(1);
    const record = JSON.parse(logSpy.mock.calls[0]![0] as string);
    expect(record).toMatchObject({ op: 'fetchCuratedManifest', level: 'trace' });
    expect(record.durationMs).toBeGreaterThanOrEqual(0);
    expect(record).not.toHaveProperty('output');
    logSpy.mockRestore();
  });

  it('configures a route sink before its instrumented handler runs', async () => {
    resetInstrumentationForTests();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const handler = withEdgeInstrumentation(
      withInstrumentation(async () => new Response('ok'), { op: 'routeHandler', level: 'trace' })
    );

    await handler({
      env: {
        INSTRUMENTATION_ENABLED: 'true',
        INSTRUMENTATION_LEVEL: 'trace',
        INSTRUMENTATION_OPS: 'routeHandler',
        INSTRUMENTATION_TIMING_ONLY: 'true'
      }
    } as never);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logSpy.mock.calls[0]![0] as string)).toMatchObject({ op: 'routeHandler', level: 'trace' });
    logSpy.mockRestore();
  });
});
