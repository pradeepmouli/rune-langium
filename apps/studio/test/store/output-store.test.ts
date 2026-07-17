// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, beforeEach } from 'vitest';
import { useOutputStore, fmtLine } from '../../src/store/output-store.js';

describe('output store', () => {
  beforeEach(() => {
    useOutputStore.setState({ lines: [] });
  });

  it('addLine with no meta behaves exactly as before (backward compatible)', () => {
    useOutputStore.getState().addLine(fmtLine('lsp', 'connected'), 'success');
    const [line] = useOutputStore.getState().lines;
    expect(line.text).toBe('[lsp] connected');
    expect(line.severity).toBe('success');
    expect(line.op).toBeUndefined();
    expect(line.durationMs).toBeUndefined();
  });

  it('addLine accepts optional structured metadata for op-log correlation', () => {
    useOutputStore.getState().addLine(fmtLine('cdmLoad', 'loaded'), 'success', {
      op: 'cdmLoad',
      subject: 'cdm',
      durationMs: 4200,
      opId: 7
    });
    const [line] = useOutputStore.getState().lines;
    expect(line.op).toBe('cdmLoad');
    expect(line.subject).toBe('cdm');
    expect(line.durationMs).toBe(4200);
    expect(line.opId).toBe(7);
  });
});
