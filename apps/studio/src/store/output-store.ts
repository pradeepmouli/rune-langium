// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { create } from 'zustand';

export type OutputSeverity = 'info' | 'warn' | 'error' | 'success';

export interface OutputLine {
  id: number;
  text: string;
  severity: OutputSeverity;
  ts: number;
}

interface OutputState {
  lines: OutputLine[];
  addLine(text: string, severity?: OutputSeverity): void;
  clearLines(): void;
}

let _idCounter = 0;

export const useOutputStore = create<OutputState>((set) => ({
  lines: [],

  addLine(text: string, severity: OutputSeverity = 'info'): void {
    const line: OutputLine = {
      id: ++_idCounter,
      text,
      severity,
      ts: performance.now() as number,
    };
    set((state) => ({ lines: [...state.lines, line] }));
  },

  clearLines(): void {
    set({ lines: [] });
  },
}));

export function fmtLine(source: string, message: string, detail?: string): string {
  const base = `[${source}] ${message}`;
  return detail !== undefined ? `${base} · ${detail}` : base;
}

export const SEV: Record<OutputSeverity, string> = {
  success: '✓',
  info: '',
  warn: '△',
  error: '✗',
};
