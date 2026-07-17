// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, beforeEach } from 'vitest';
import { useActivityStore } from '../../src/store/activity-store.js';

describe('activity store', () => {
  beforeEach(() => {
    useActivityStore.setState({ entries: [] });
  });

  it('addActivity with no meta behaves exactly as before, and stamps a numeric ts', () => {
    const before = performance.now();
    useActivityStore.getState().addActivity('lsp', true, 'connected');
    const [entry] = useActivityStore.getState().entries;
    expect(entry.tag).toBe('lsp');
    expect(entry.ok).toBe(true);
    expect(entry.msg).toBe('connected');
    expect(entry.ts).toBeGreaterThanOrEqual(before);
    expect(entry.subject).toBeUndefined();
    expect(entry.durationMs).toBeUndefined();
  });

  it('addActivity accepts optional structured metadata for op-log correlation', () => {
    useActivityStore.getState().addActivity('cdmLoad', true, 'loaded', {
      subject: 'cdm',
      durationMs: 4200,
      opId: 7
    });
    const [entry] = useActivityStore.getState().entries;
    expect(entry.subject).toBe('cdm');
    expect(entry.durationMs).toBe(4200);
    expect(entry.opId).toBe(7);
  });
});
