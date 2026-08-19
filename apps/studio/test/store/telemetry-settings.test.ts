// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { saveSetting, loadSetting } = vi.hoisted(() => ({
  saveSetting: vi.fn(async () => {}),
  loadSetting: vi.fn(async () => undefined)
}));

vi.mock('../../src/workspace/persistence.js', () => ({ saveSetting, loadSetting }));

import { useTelemetrySettingsStore, hydrateTelemetrySettings } from '../../src/store/telemetry-settings.js';

describe('telemetry settings store', () => {
  beforeEach(() => {
    saveSetting.mockClear();
    loadSetting.mockClear();
    loadSetting.mockResolvedValue(undefined);
    useTelemetrySettingsStore.setState({ enabled: false, hydrated: false, enabledFromHydration: false });
  });

  it('defaults to disabled (opt-in, not opt-out) before hydration', () => {
    expect(useTelemetrySettingsStore.getState().enabled).toBe(false);
    expect(useTelemetrySettingsStore.getState().hydrated).toBe(false);
  });

  it('hydrateTelemetrySettings reads the persisted value and marks hydrated', async () => {
    loadSetting.mockResolvedValueOnce(true);
    await hydrateTelemetrySettings();
    expect(loadSetting).toHaveBeenCalledWith('telemetry-enabled');
    expect(useTelemetrySettingsStore.getState().enabled).toBe(true);
    expect(useTelemetrySettingsStore.getState().hydrated).toBe(true);
  });

  it('hydrateTelemetrySettings defaults to false when nothing is persisted yet', async () => {
    loadSetting.mockResolvedValueOnce(undefined);
    await hydrateTelemetrySettings();
    expect(useTelemetrySettingsStore.getState().enabled).toBe(false);
    expect(useTelemetrySettingsStore.getState().hydrated).toBe(true);
  });

  it('setEnabled persists the new value and updates state synchronously', () => {
    useTelemetrySettingsStore.getState().setEnabled(true);
    expect(useTelemetrySettingsStore.getState().enabled).toBe(true);
    expect(saveSetting).toHaveBeenCalledWith('telemetry-enabled', true);
  });

  it('a user toggle before hydration resolves wins — hydration does not revert it', async () => {
    // Simulate the race: loadSetting() is in flight (resolves to the stale
    // pre-toggle persisted value, false) while the user flips the toggle on.
    let resolveLoad!: (value: boolean | undefined) => void;
    loadSetting.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLoad = resolve;
      })
    );
    const hydratePromise = hydrateTelemetrySettings();

    useTelemetrySettingsStore.getState().setEnabled(true);
    expect(useTelemetrySettingsStore.getState().enabled).toBe(true);

    resolveLoad(false);
    await hydratePromise;

    expect(useTelemetrySettingsStore.getState().enabled, 'hydration must not revert the user action').toBe(true);
  });

  // Regression coverage for enabledFromHydration — installTelemetryShipper
  // uses this to decide whether it's safe to backfill spans that arrived
  // before it installed. Getting this wrong either way is a real bug: too
  // permissive leaks pre-consent activity, too strict silently drops the
  // exact cold-start telemetry a returning user's connect-phase spans are
  // trying to capture.
  it('enabledFromHydration is true only when hydration loads an already-persisted enabled=true', async () => {
    loadSetting.mockResolvedValueOnce(true);
    await hydrateTelemetrySettings();
    expect(useTelemetrySettingsStore.getState().enabledFromHydration).toBe(true);
  });

  it('enabledFromHydration stays false when hydration loads a persisted false', async () => {
    loadSetting.mockResolvedValueOnce(false);
    await hydrateTelemetrySettings();
    expect(useTelemetrySettingsStore.getState().enabled).toBe(false);
    expect(useTelemetrySettingsStore.getState().enabledFromHydration).toBe(false);
  });

  it('enabledFromHydration stays false when nothing is persisted yet (a brand-new user)', async () => {
    loadSetting.mockResolvedValueOnce(undefined);
    await hydrateTelemetrySettings();
    expect(useTelemetrySettingsStore.getState().enabledFromHydration).toBe(false);
  });

  it('setEnabled(true) never sets enabledFromHydration — a live user action is never "from hydration"', () => {
    useTelemetrySettingsStore.getState().setEnabled(true);
    expect(useTelemetrySettingsStore.getState().enabled).toBe(true);
    expect(useTelemetrySettingsStore.getState().enabledFromHydration).toBe(false);
  });

  it('an explicit toggle before hydration resolves keeps enabledFromHydration false even though the persisted value later resolves true', async () => {
    let resolveLoad!: (value: boolean | undefined) => void;
    loadSetting.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLoad = resolve;
      })
    );
    const hydratePromise = hydrateTelemetrySettings();
    useTelemetrySettingsStore.getState().setEnabled(true);
    resolveLoad(true);
    await hydratePromise;

    expect(
      useTelemetrySettingsStore.getState().enabledFromHydration,
      'a fresh explicit opt-in, not a returning-user hydration'
    ).toBe(false);
  });
});
