// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, beforeEach } from 'vitest';
import { useOutputStore } from '../../src/store/output-store.js';
import { useActivityStore } from '../../src/store/activity-store.js';
import { allocateOpId, getOpLogSnapshot } from '../../src/services/op-log.js';

describe('op-log', () => {
  beforeEach(() => {
    useOutputStore.setState({ lines: [] });
    useActivityStore.setState({ entries: [] });
  });

  it('allocateOpId returns increasing ids', () => {
    const a = allocateOpId();
    const b = allocateOpId();
    expect(b).toBeGreaterThan(a);
  });

  it('merges output-store lines and activity-store entries, sorted by ts', () => {
    useOutputStore.getState().addLine('[lsp] connected', 'success', { op: 'lsp' });
    useActivityStore.getState().addActivity('cdmLoad', true, 'loaded', { durationMs: 4200 });

    const snapshot = getOpLogSnapshot();
    expect(snapshot).toHaveLength(2);
    expect(snapshot.map((e) => e.panel)).toEqual(['output', 'activity']);
    expect(snapshot[0].op).toBe('lsp');
    expect(snapshot[0].level).toBe('success');
    expect(snapshot[1].op).toBe('cdmLoad');
    expect(snapshot[1].durationMs).toBe(4200);
    // sorted ascending by ts
    expect(snapshot[0].ts).toBeLessThanOrEqual(snapshot[1].ts);
  });

  it('sorts by ts even when entries are added in reverse timestamp order', () => {
    // This test directly sets entries with explicit ts values in the OPPOSITE order
    // of what the snapshot should produce. This verifies that getOpLogSnapshot()
    // genuinely sorts by ts and doesn't just rely on insertion order.
    // If the .sort(...) call were removed, this test would fail because the
    // raw concatenation would produce [activity, output] but sorted would need [output, activity].
    const laterTs = performance.now() + 1000;
    const earlierTs = performance.now();

    useOutputStore.setState({
      lines: [
        {
          text: 'later output',
          severity: 'info',
          ts: laterTs,
          op: 'delayed',
          subject: undefined,
          durationMs: undefined,
          opId: undefined
        }
      ]
    });

    useActivityStore.setState({
      entries: [
        {
          tag: 'early',
          ok: true,
          msg: 'earlier activity',
          ts: earlierTs,
          subject: undefined,
          durationMs: undefined,
          opId: undefined
        }
      ]
    });

    const snapshot = getOpLogSnapshot();
    expect(snapshot).toHaveLength(2);
    // Despite activity being constructed after output, it has an earlier ts,
    // so it should appear first in the sorted snapshot.
    expect(snapshot[0].op).toBe('early');
    expect(snapshot[0].panel).toBe('activity');
    expect(snapshot[1].op).toBe('delayed');
    expect(snapshot[1].panel).toBe('output');
    // Verify strict ascending order
    expect(snapshot[0].ts).toBeLessThan(snapshot[1].ts);
  });

  it('maps activity ok=false to level "error"', () => {
    useActivityStore.getState().addActivity('workspace', false, 'save failed');
    const [entry] = getOpLogSnapshot();
    expect(entry.level).toBe('error');
  });
});
