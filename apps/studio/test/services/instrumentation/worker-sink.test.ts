// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { beforeEach, describe, expect, it } from 'vitest';
import { installInstrumentationWorkerSink } from '../../../src/services/instrumentation/worker-sink.js';
import { useTelemetrySettingsStore } from '../../../src/store/telemetry-settings.js';
import {
  Capture,
  resetInstrumentationForTests,
  resetInstrumentationThresholdForTests,
  setInstrumentationThreshold,
  withInstrumentation
} from '../../../src/services/instrumentation/core.js';

beforeEach(() => {
  useTelemetrySettingsStore.setState({ enabled: true, hydrated: true });
});

describe('installInstrumentationWorkerSink', () => {
  it('posts a telemetry:record message carrying the TelemetryRecord via the given post function', () => {
    resetInstrumentationForTests();
    resetInstrumentationThresholdForTests();
    const posted: unknown[] = [];
    installInstrumentationWorkerSink((msg) => posted.push(msg));
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 1, {
      op: 'workerOp',
      level: 'info',
      capture: Capture.Output,
      sanitize: (v) => v
    });
    wrapped();
    expect(posted).toEqual([{ type: 'telemetry:record', record: expect.objectContaining({ op: 'workerOp' }) }]);
  });
});
