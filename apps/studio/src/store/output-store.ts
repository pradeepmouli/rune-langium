// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { create } from 'zustand';
import { withInstrumentation } from '../services/instrumentation/core.js';

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

/**
 * Plain, uninstrumented core — exported separately so instrumentation
 * sink implementations (e.g. browser-sink.ts's terminal sink) can format
 * a line without re-entering `withInstrumentation`. A sink calling the
 * instrumented `fmtLine` below would emit a new record on every call,
 * which its own configured sink would then format via `fmtLine` again —
 * unbounded recursion once the threshold is low enough to clear it.
 * Ordinary call sites should keep using the instrumented `fmtLine`.
 */
// oxlint-disable-next-line rune/no-uninstrumented-export -- deliberately plain, see comment above
export function formatLine(source: string, message: string, detail?: string): string {
  const base = `[${source}] ${message}`;
  return detail !== undefined ? `${base} · ${detail}` : base;
  // `message`/`detail` are free-form text — many call sites pass a raw
  // error.message or file-path-bearing string through here — never captured.
}

export const fmtLine = withInstrumentation(formatLine, { op: 'fmtLine' });

export const SEV: Record<OutputSeverity, string> = {
  success: '✓',
  info: '',
  warn: '△',
  error: '✗'
};
