// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useOutputStore } from '../../src/store/output-store.js';
import { useActivityStore } from '../../src/store/activity-store.js';
import { useTelemetrySettingsStore } from '../../src/store/telemetry-settings.js';
import { installTelemetryShipper } from '../../src/services/telemetry-shipper.js';
import { createTelemetryClient } from '../../src/services/telemetry.js';

describe('installTelemetryShipper', () => {
  let uninstall: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    useOutputStore.setState({ lines: [] });
    useActivityStore.setState({ entries: [] });
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
    // modelLoad is on the subject allowlist (see below) so this exercises
    // signature-threading without conflating it with the allowlist itself.
    useOutputStore
      .getState()
      .addLine('boom', 'error', { op: 'modelLoad', subject: 'cdm', signature: 'boom @ app.js:1' });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'op_spans',
        spans: expect.arrayContaining([
          expect.objectContaining({ op: 'modelLoad', subject: 'cdm', signature: 'boom @ app.js:1' })
        ])
      })
    );
  });

  it('ships subject for an allowlisted op (modelLoad — a curated model id, never scratch content)', async () => {
    const emit = vi.fn(async () => {});
    uninstall = installTelemetryShipper({ emit });
    // 'error' severity for a deterministic 100% sample rate — 'info' is
    // only sampled at 2% and would make this test flaky.
    useOutputStore.getState().addLine('load failed', 'error', { op: 'modelLoad', subject: 'cdm' });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'op_spans',
        spans: expect.arrayContaining([expect.objectContaining({ op: 'modelLoad', subject: 'cdm' })])
      })
    );
  });

  it('drops subject for a non-allowlisted output-store op', async () => {
    const emit = vi.fn(async () => {});
    uninstall = installTelemetryShipper({ emit });
    useOutputStore.getState().addLine('boom', 'error', { op: 'someOtherOp', subject: 'not-vetted' });
    await vi.advanceTimersByTimeAsync(15_000);
    const spans = emit.mock.calls[0]?.[0]?.spans ?? [];
    const span = spans.find((s: { op: string }) => s.op === 'someOtherOp');
    expect(span).toBeDefined();
    expect(span.subject).toBeUndefined();
  });

  it('drops subject for activity-store entries whose op is not allowlisted — e.g. functionExecute, whose subject is a user-authored model function name', async () => {
    const emit = vi.fn(async () => {});
    uninstall = installTelemetryShipper({ emit });
    // ok:false -> level 'error' (100% sample rate) for a deterministic test;
    // ok:true would map to 'info' (2% sampled) and be flaky.
    useActivityStore
      .getState()
      .addActivity('functionExecute', false, 'myScratchFunc failed', { subject: 'myScratchFunc' });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(emit).toHaveBeenCalledTimes(1);
    const spans = emit.mock.calls[0]?.[0]?.spans ?? [];
    const span = spans.find((s: { op: string }) => s.op === 'functionExecute');
    expect(span).toBeDefined();
    expect(span.subject).toBeUndefined();
  });

  it('ships subject for activity-store entries on an allowlisted op', async () => {
    const emit = vi.fn(async () => {});
    uninstall = installTelemetryShipper({ emit });
    useActivityStore.getState().addActivity('modelLoad', false, 'cdm load failed', { subject: 'cdm' });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'op_spans',
        spans: expect.arrayContaining([expect.objectContaining({ op: 'modelLoad', subject: 'cdm' })])
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

  it('rounds a fractional durationMs (as performance.now() deltas always are) — the wire schema requires an integer', async () => {
    const emit = vi.fn(async () => {});
    uninstall = installTelemetryShipper({ emit });
    useOutputStore.getState().addLine('loaded', 'error', { op: 'modelLoad', durationMs: 1234.5678 });
    await vi.advanceTimersByTimeAsync(15_000);
    const spans = emit.mock.calls[0]?.[0]?.spans ?? [];
    const span = spans.find((s: { op: string }) => s.op === 'modelLoad');
    expect(span).toBeDefined();
    expect(Number.isInteger(span.durationMs)).toBe(true);
    expect(span.durationMs).toBe(1235);
  });

  it('a fractional durationMs no longer fails REAL schema validation, so the batch actually reaches fetch()', async () => {
    // Regression for the actual bug: createTelemetryClient's emit() runs
    // Zod schema validation (durationMs must be an integer) BEFORE the
    // network call. Before this fix, that validation threw for any batch
    // containing a fractional duration, and installTelemetryShipper's
    // flush() swallows the rejection — so the ONLY externally-observable
    // symptom is that fetch() never gets called (the batch silently
    // vanishes). Asserting fetch WAS called, with an integer durationMs in
    // the body, is what actually distinguishes "bug present" (never
    // called) from "bug fixed" (called).
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchSpy);
    const client = createTelemetryClient({
      endpoint: 'https://example.invalid/rune-studio/api/telemetry/v1/event',
      enabled: true,
      studioVersion: '0.1.0',
      uaClass: 'test'
    });
    uninstall = installTelemetryShipper(client);
    useOutputStore.getState().addLine('loaded', 'error', { op: 'modelLoad', durationMs: 42.999 });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
    const span = body.spans.find((s: { op: string }) => s.op === 'modelLoad');
    expect(Number.isInteger(span.durationMs)).toBe(true);
    vi.unstubAllGlobals();
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
