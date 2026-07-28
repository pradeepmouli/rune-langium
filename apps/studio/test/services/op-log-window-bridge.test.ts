// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useOutputStore } from '../../src/store/output-store.js';
import { useActivityStore } from '../../src/store/activity-store.js';
import { installOpLogWindowBridge } from '../../src/services/op-log-window-bridge.js';

describe('op-log window bridge', () => {
  beforeEach(() => {
    useOutputStore.setState({ lines: [] });
    useActivityStore.setState({ entries: [] });
    delete (window as unknown as Record<string, unknown>).__runeStudioOpLog;
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__runeStudioOpLog;
  });

  it('installs a read-only window.__runeStudioOpLog.snapshot()', () => {
    installOpLogWindowBridge();
    useActivityStore.getState().addActivity('lsp', true, 'connected');

    expect(window.__runeStudioOpLog).toBeDefined();
    const snapshot = window.__runeStudioOpLog!.snapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].op).toBe('lsp');
  });

  it('exposes exactly one method — no write surface', () => {
    installOpLogWindowBridge();
    expect(Object.keys(window.__runeStudioOpLog!)).toEqual(['snapshot']);
  });
});
