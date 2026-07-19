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
    // Regression coverage for the client-capture -> shipper -> worker seam:
    // the dedup grouping key must land in `signature`, not `subject` (a
    // separate field other op-log producers use for a general correlator
    // like a model id) — telemetry-shipper.ts only forwards `signature`
    // into the wire schema's own `signature` field.
    expect(entry?.signature).toBeDefined();
    // Privacy: signature is `<AllowlistedErrorName>:<hash>`, never raw
    // message/stack text (which can carry workspace-derived content).
    expect(entry?.signature).toMatch(/^Error:[0-9a-f]{8}$/);
    expect(entry?.signature).not.toContain('boom');
  });

  it('never transmits raw error message/stack text in the signature (privacy invariant)', () => {
    uninstall = installTelemetryCapture();
    const sensitive = 'workspace.myNamespace.SecretType at /Users/me/scratch/private-model.rosetta';
    window.dispatchEvent(new ErrorEvent('error', { message: sensitive, error: new Error(sensitive) }));
    const entry = useOutputStore.getState().lines.find((l) => l.op === 'clientError');
    expect(entry?.signature).toBeDefined();
    expect(entry?.signature).not.toContain('workspace');
    expect(entry?.signature).not.toContain('SecretType');
    expect(entry?.signature).not.toContain('scratch');
  });

  it('the same recurring error produces the same signature (deterministic grouping)', () => {
    uninstall = installTelemetryCapture();
    // Reuse one Error instance (same message + stack) to simulate the SAME
    // bug recurring from the same source location — two `new Error('boom')`
    // calls on different lines would legitimately have different stacks
    // and are not the scenario this asserts.
    const err = new Error('boom');
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom', error: err }));
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom', error: err }));
    const entries = useOutputStore.getState().lines.filter((l) => l.op === 'clientError');
    expect(entries).toHaveLength(2);
    expect(entries[0]?.signature).toBe(entries[1]?.signature);
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
    expect(entry?.signature).toBeDefined();
    expect(entry?.signature).toMatch(/^Error:[0-9a-f]{8}$/);
    expect(entry?.signature).not.toContain('rejected');
  });

  it('teardown stops publishing further errors', () => {
    uninstall = installTelemetryCapture();
    uninstall();
    const before = useOutputStore.getState().lines.length;
    window.dispatchEvent(new ErrorEvent('error', { message: 'after teardown' }));
    expect(useOutputStore.getState().lines.length).toBe(before);
  });
});
