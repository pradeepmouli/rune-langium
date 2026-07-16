// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { create } from 'zustand';

export interface ActivityEntry {
  id: number;
  time: string;
  /** Numeric monotonic timestamp (performance.now()) — for op-log correlation/sorting. `time` above stays the HH:MM:SS display string the panel renders. */
  ts: number;
  tag: string;
  ok: boolean;
  msg: string;
  subject?: string;
  durationMs?: number;
  opId?: number;
}

export interface AddActivityMeta {
  subject?: string;
  durationMs?: number;
  opId?: number;
}

interface ActivityState {
  entries: ActivityEntry[];
  addActivity: (tag: string, ok: boolean, msg: string, meta?: AddActivityMeta) => void;
  clearEntries: () => void;
}

let _id = 0;
const MAX_ENTRIES = 200;

function nowHHMMSS(): string {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}

export const useActivityStore = create<ActivityState>((set) => ({
  entries: [],
  addActivity: (tag, ok, msg, meta) =>
    set((s) => {
      const next = [...s.entries, { id: ++_id, time: nowHHMMSS(), ts: performance.now(), tag, ok, msg, ...meta }];
      return { entries: next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next };
    }),
  clearEntries: () => set({ entries: [] })
}));
