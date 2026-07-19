// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useOutputStore } from '../../src/store/output-store.js';
import { useTelemetrySettingsStore } from '../../src/store/telemetry-settings.js';
import { installTelemetryShipper } from '../../src/services/telemetry-shipper.js';

describe('installTelemetryShipper', () => {
  let uninstall: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    useOutputStore.setState({ lines: [] });
    useTelemetrySettingsStore.setState({ enabled: true, hydrated: true });
  });

  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
    vi.useRealTimers();
  });

  it('ships an error entry at 100% sample rate on the next flush tick', async () => {
    const emit = vi.fn(async () => {});
    uninstall = installTelemetryShipper({ emit });
    useOutputStore.getState().addLine('boom', 'error', { op: 'clientError', subject: 'sig' });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'op_spans',
        spans: expect.arrayContaining([expect.objectContaining({ op: 'clientError', level: 'error' })])
      })
    );
  });

  it('does not ship anything when telemetry is disabled', async () => {
    useTelemetrySettingsStore.setState({ enabled: false, hydrated: true });
    const emit = vi.fn(async () => {});
    uninstall = installTelemetryShipper({ emit });
    useOutputStore.getState().addLine('boom', 'error', { op: 'clientError' });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(emit).not.toHaveBeenCalled();
  });

  it('flushes early once the buffer reaches 20 entries without waiting for the timer', async () => {
    const emit = vi.fn(async () => {});
    uninstall = installTelemetryShipper({ emit });
    for (let i = 0; i < 20; i++) {
      useOutputStore.getState().addLine(`err ${i}`, 'error', { op: 'clientError' });
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0].spans).toHaveLength(20);
  });
});
