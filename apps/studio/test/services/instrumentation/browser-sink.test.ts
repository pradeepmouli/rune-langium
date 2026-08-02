// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOutputStore } from '../../../src/store/output-store.js';
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
});
