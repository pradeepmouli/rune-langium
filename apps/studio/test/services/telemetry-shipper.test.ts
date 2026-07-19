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

  it('threads the error/warn dedup signature through to the shipped span, distinct from subject', async () => {
    const emit = vi.fn(async () => {});
    uninstall = installTelemetryShipper({ emit });
    useOutputStore
      .getState()
      .addLine('boom', 'error', { op: 'clientError', subject: 'general-subject', signature: 'boom @ app.js:1' });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'op_spans',
        spans: expect.arrayContaining([
          expect.objectContaining({ op: 'clientError', subject: 'general-subject', signature: 'boom @ app.js:1' })
        ])
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

  it('still picks up a new entry after the underlying store rotates (front-trims) its array', async () => {
    // Seed a few entries so the watermark advances past 0, then simulate
    // ring-buffer rotation: the store's array "shrinks" (old entries
    // trimmed from the front) while a new entry with a higher `id` than
    // anything previously seen is appended. A length-based watermark
    // (`lines.length <= lastOutputLen`) would treat this as "no growth"
    // and silently drop the new entry; the id-based watermark must not.
    const emit = vi.fn(async () => {});
    uninstall = installTelemetryShipper({ emit });

    useOutputStore.getState().addLine('one', 'error', { op: 'first' });
    useOutputStore.getState().addLine('two', 'error', { op: 'second' });
    useOutputStore.getState().addLine('three', 'error', { op: 'third' });
    // Advance past the flush so these don't get counted twice, and clear the
    // mock so only the post-rotation entry is asserted below.
    await vi.advanceTimersByTimeAsync(15_000);
    emit.mockClear();

    // `_idCounter` in output-store.ts is a module-level counter shared across
    // the whole test file (never reset by `setState({ lines: [] })`), so we
    // can't hardcode an id here — derive the next id relative to whatever the
    // counter has actually reached. Simulate rotation: the array shrinks to
    // just ONE entry (as if everything before it had been trimmed from the
    // front), but that entry's id is higher than the last-seen watermark.
    const lastSeenId = useOutputStore.getState().lines.at(-1)?.id ?? 0;
    useOutputStore.setState({
      lines: [{ id: lastSeenId + 1, text: 'rotated-in', severity: 'error', ts: performance.now(), op: 'afterRotation' }]
    });

    await vi.advanceTimersByTimeAsync(15_000);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'op_spans',
        spans: expect.arrayContaining([expect.objectContaining({ op: 'afterRotation', level: 'error' })])
      })
    );
  });
});
