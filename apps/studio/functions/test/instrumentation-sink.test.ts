// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it, vi } from 'vitest';
import { installInstrumentationEdgeSink } from '../lib/instrumentation-sink.js';
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
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 1, { op: 'edgeOp', level: 'info' });
    wrapped();
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
