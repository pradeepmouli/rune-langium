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

  it('maps activity ok=false to level "error"', () => {
    useActivityStore.getState().addActivity('workspace', false, 'save failed');
    const [entry] = getOpLogSnapshot();
    expect(entry.level).toBe('error');
  });
});
