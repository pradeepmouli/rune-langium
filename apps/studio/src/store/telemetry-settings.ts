// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { create } from 'zustand';
import { saveSetting, loadSetting } from '../workspace/persistence.js';
import { withInstrumentation } from '../services/instrumentation/core.js';

interface TelemetrySettingsState {
  /** Per-user runtime opt-in. Defaults to false (opt-IN, not opt-out) until hydrated from IndexedDB. */
  enabled: boolean;
  /** True once hydrateTelemetrySettings() has resolved — consumers should not ship telemetry before this. */
  hydrated: boolean;
  /**
   * True only when `enabled` became true via hydrateTelemetrySettings()
   * loading an already-persisted opt-in (a RETURNING consenting user) —
   * never via an explicit setEnabled() call. installTelemetryShipper uses
   * this to decide whether it's safe to backfill spans that accumulated
   * before it installed: for a returning user that's just catching up on
   * a real hydration-timing race, but for someone flipping the Settings
   * checkbox for the first time this session, ANY pre-existing activity
   * predates their consent and must never be backfilled/shipped — see
   * App.tsx's "never install-then-gate-at-emit-time" invariant.
   */
  enabledFromHydration: boolean;
  setEnabled(next: boolean): void;
}

export const useTelemetrySettingsStore = create<TelemetrySettingsState>((set) => ({
  enabled: false,
  hydrated: false,
  enabledFromHydration: false,
  setEnabled(next: boolean): void {
    // Mark hydrated here too: an explicit user action is authoritative and
    // must win over a hydrateTelemetrySettings() read still in flight (the
    // user can toggle the Settings checkbox before the initial IndexedDB
    // loadSetting() resolves — without this, that read would land afterward
    // and silently revert the toggle back to the stale persisted value).
    // enabledFromHydration is always false here — a live user action is
    // never "from hydration," even if it happens to match the persisted
    // value — see that field's own doc comment.
    set({ enabled: next, hydrated: true, enabledFromHydration: false });
    void saveSetting('telemetry-enabled', next);
  }
}));

export const hydrateTelemetrySettings = withInstrumentation(
  async function hydrateTelemetrySettings(): Promise<void> {
    const stored = await loadSetting<boolean>('telemetry-enabled');
    // No-op if the user already made an explicit choice via setEnabled while
    // this read was in flight — see the race note there.
    if (useTelemetrySettingsStore.getState().hydrated) return;
    useTelemetrySettingsStore.setState({
      enabled: stored ?? false,
      hydrated: true,
      enabledFromHydration: stored === true
    });
  },
  { op: 'hydrateTelemetrySettings' }
);
