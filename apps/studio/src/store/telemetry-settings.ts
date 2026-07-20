// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { create } from 'zustand';
import { saveSetting, loadSetting } from '../workspace/persistence.js';

interface TelemetrySettingsState {
  /** Per-user runtime opt-in. Defaults to false (opt-IN, not opt-out) until hydrated from IndexedDB. */
  enabled: boolean;
  /** True once hydrateTelemetrySettings() has resolved — consumers should not ship telemetry before this. */
  hydrated: boolean;
  setEnabled(next: boolean): void;
}

export const useTelemetrySettingsStore = create<TelemetrySettingsState>((set) => ({
  enabled: false,
  hydrated: false,
  setEnabled(next: boolean): void {
    // Mark hydrated here too: an explicit user action is authoritative and
    // must win over a hydrateTelemetrySettings() read still in flight (the
    // user can toggle the Settings checkbox before the initial IndexedDB
    // loadSetting() resolves — without this, that read would land afterward
    // and silently revert the toggle back to the stale persisted value).
    set({ enabled: next, hydrated: true });
    void saveSetting('telemetry-enabled', next);
  }
}));

/** Reads the persisted opt-in once at startup. Call from App.tsx's init sequence, same as other one-shot hydration reads. */
export async function hydrateTelemetrySettings(): Promise<void> {
  const stored = await loadSetting<boolean>('telemetry-enabled');
  // No-op if the user already made an explicit choice via setEnabled while
  // this read was in flight — see the race note there.
  if (useTelemetrySettingsStore.getState().hydrated) return;
  useTelemetrySettingsStore.setState({ enabled: stored ?? false, hydrated: true });
}
