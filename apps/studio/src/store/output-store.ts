// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { create } from 'zustand';

export type OutputSeverity = 'info' | 'warn' | 'error' | 'success';

export interface OutputLine {
  id: number;
  text: string;
  severity: OutputSeverity;
  ts: number;
  /** Structured op-log correlation fields — optional, set by producers that want span/duration tracking (op-log.ts reads these; existing callers are unaffected). */
  op?: string;
  subject?: string;
  durationMs?: number;
  opId?: number;
  /** Error/warn dedup grouping key (top stack frame + message) — distinct from `subject`, which other producers use for a general op correlator like a model id. Read by telemetry-shipper.ts's op_spans mapping. */
  signature?: string;
}

export interface AddLineMeta {
  op?: string;
  subject?: string;
  durationMs?: number;
  opId?: number;
  signature?: string;
}

interface OutputState {
  lines: OutputLine[];
  addLine(text: string, severity?: OutputSeverity, meta?: AddLineMeta): void;
  clearLines(): void;
}

let _idCounter = 0;
const MAX_LINES = 500;

export const useOutputStore = create<OutputState>((set) => ({
  lines: [],

  addLine(text: string, severity: OutputSeverity = 'info', meta?: AddLineMeta): void {
    const line: OutputLine = {
      id: ++_idCounter,
      text,
      severity,
      ts: performance.now() as number,
      ...meta
    };
    set((state) => {
      const next = [...state.lines, line];
      return { lines: next.length > MAX_LINES ? next.slice(-MAX_LINES) : next };
    });
  },

  clearLines(): void {
    set({ lines: [] });
  }
}));

export function fmtLine(source: string, message: string, detail?: string): string {
  const base = `[${source}] ${message}`;
  return detail !== undefined ? `${base} · ${detail}` : base;
}

export const SEV: Record<OutputSeverity, string> = {
  success: '✓',
  info: '',
  warn: '△',
  error: '✗'
};
