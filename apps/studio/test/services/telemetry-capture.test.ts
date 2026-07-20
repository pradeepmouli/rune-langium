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
    expect(entry?.signature).toMatch(/^Error:[0-9a-f]{16}$/);
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

  it('the signature does not depend on the error message — only the top stack frame and allowlisted name', () => {
    // Codex P1 (round 2): a deterministic hash of the message is still
    // dictionary-attackable even though the raw text is never sent (error
    // messages are low-entropy, guessable text). The signature must be
    // derived only from data that's never user/model content — the top
    // stack frame identifies a location in Studio's own bundled code, not
    // the workspace. Prove it by throwing from the SAME call site (so the
    // stack's top frame matches) with two DIFFERENT messages and asserting
    // the signatures are identical.
    uninstall = installTelemetryCapture();
    function throwFromHere(msg: string): void {
      throw new Error(msg);
    }
    let errA: Error | undefined;
    let errB: Error | undefined;
    try {
      throwFromHere('first message');
    } catch (e) {
      errA = e as Error;
    }
    try {
      throwFromHere('a totally different second message');
    } catch (e) {
      errB = e as Error;
    }
    window.dispatchEvent(new ErrorEvent('error', { message: 'first message', error: errA }));
    window.dispatchEvent(new ErrorEvent('error', { message: 'a totally different second message', error: errB }));
    const entries = useOutputStore.getState().lines.filter((l) => l.op === 'clientError');
    expect(entries).toHaveLength(2);
    expect(entries[0]?.signature).toBe(entries[1]?.signature);
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
    expect(entry?.signature).toMatch(/^Error:[0-9a-f]{16}$/);
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
