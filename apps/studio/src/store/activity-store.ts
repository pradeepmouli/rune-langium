// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { create } from 'zustand';

export interface ActivityEntry {
  id: number;
  time: string;
  tag: string;
  ok: boolean;
  msg: string;
}

interface ActivityState {
  entries: ActivityEntry[];
  addActivity: (tag: string, ok: boolean, msg: string) => void;
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
  addActivity: (tag, ok, msg) =>
    set((s) => {
      const next = [...s.entries, { id: ++_id, time: nowHHMMSS(), tag, ok, msg }];
      return { entries: next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next };
    }),
  clearEntries: () => set({ entries: [] })
}));
