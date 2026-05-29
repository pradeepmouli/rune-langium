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

function nowHHMMSS(): string {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

export const useActivityStore = create<ActivityState>((set) => ({
  entries: [],
  addActivity: (tag, ok, msg) =>
    set((s) => ({
      entries: [...s.entries, { id: ++_id, time: nowHHMMSS(), tag, ok, msg }]
    })),
  clearEntries: () => set({ entries: [] }),
}));
