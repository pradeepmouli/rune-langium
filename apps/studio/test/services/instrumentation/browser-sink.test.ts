// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOutputStore } from '../../../src/store/output-store.js';
import { useTelemetrySettingsStore } from '../../../src/store/telemetry-settings.js';
import {
  Capture,
  resetInstrumentationForTests,
  withInstrumentation,
  setInstrumentationThreshold,
  resetInstrumentationThresholdForTests
} from '../../../src/services/instrumentation/core.js';
import { installInstrumentationBrowserSink } from '../../../src/services/instrumentation/browser-sink.js';

beforeEach(() => {
  useOutputStore.setState({ lines: [] });
  useTelemetrySettingsStore.setState({ enabled: true, hydrated: true });
  resetInstrumentationForTests();
  resetInstrumentationThresholdForTests();
});

describe('installInstrumentationBrowserSink', () => {
  it('routes a TelemetryRecord into useOutputStore.addLine with the mapped fields', () => {
    installInstrumentationBrowserSink();
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 1, {
      op: 'browserOp',
      level: 'info',
      capture: Capture.Output,
      sanitize: (v) => v
    });
    wrapped();
    const lines = useOutputStore.getState().lines;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ op: 'browserOp', severity: 'info' });
  });

  it('does not recurse into itself at the "trace" threshold — the terminal sink must not call the instrumented fmtLine', () => {
    installInstrumentationBrowserSink();
    setInstrumentationThreshold('trace'); // the exact troubleshooting scenario that used to overflow the stack
    const wrapped = withInstrumentation(() => 1, { op: 'traceOp', level: 'trace' });
    expect(() => wrapped()).not.toThrow();
    // Exactly one line for the one instrumented call above — if the sink's
    // own formatting call had re-entered the pipe, this would be far more
    // than one line (or the call above would have thrown RangeError first).
    const lines = useOutputStore.getState().lines;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ op: 'traceOp' });
  });
});
