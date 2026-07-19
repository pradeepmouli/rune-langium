// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useOutputStore } from '../../src/store/output-store.js';
import { installTelemetryCapture } from '../../src/services/telemetry-capture.js';

describe('installTelemetryCapture', () => {
  let uninstall: () => void;

  beforeEach(() => {
    useOutputStore.setState({ lines: [] });
  });

  afterEach(() => {
    uninstall?.();
  });

  it('publishes a window error as an error-level opLog entry', () => {
    uninstall = installTelemetryCapture();
    window.dispatchEvent(
      new ErrorEvent('error', { message: 'boom', filename: 'app.js', lineno: 1, colno: 1, error: new Error('boom') })
    );
    const lines = useOutputStore.getState().lines;
    const entry = lines.find((l) => l.op === 'clientError');
    expect(entry).toBeDefined();
    expect(entry?.severity).toBe('error');
  });

  it('publishes an unhandled rejection as an error-level opLog entry', () => {
    uninstall = installTelemetryCapture();
    const event = new Event('unhandledrejection') as PromiseRejectionEvent & { reason: unknown };
    Object.defineProperty(event, 'reason', { value: new Error('rejected') });
    window.dispatchEvent(event);
    const lines = useOutputStore.getState().lines;
    const entry = lines.find((l) => l.op === 'clientUnhandledRejection');
    expect(entry).toBeDefined();
    expect(entry?.severity).toBe('error');
  });

  it('teardown stops publishing further errors', () => {
    uninstall = installTelemetryCapture();
    uninstall();
    const before = useOutputStore.getState().lines.length;
    window.dispatchEvent(new ErrorEvent('error', { message: 'after teardown' }));
    expect(useOutputStore.getState().lines.length).toBe(before);
  });
});
