// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { beforeEach, describe, expect, it, vi } from 'vitest';

const persistence = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  saveSetting: vi.fn(async (key: string, value: unknown) => {
    persistence.values.set(key, value);
  }),
  loadSetting: vi.fn(async (key: string) => persistence.values.get(key))
}));

vi.mock('../../src/workspace/persistence.js', () => persistence);

import {
  readWorkbenchSettings,
  workbenchSettingsKey,
  writeWorkbenchSettings
} from '../../src/shell/workbench-settings.js';

describe('workbench settings', () => {
  beforeEach(() => {
    persistence.values.clear();
    persistence.saveSetting.mockClear();
    persistence.loadSetting.mockClear();
    persistence.saveSetting.mockImplementation(async (key: string, value: unknown) => {
      persistence.values.set(key, value);
    });
    persistence.loadSetting.mockImplementation(async (key: string) => persistence.values.get(key));
  });

  it('keeps perspective state separate', async () => {
    await writeWorkbenchSettings('workspace-a', 'prototype', { selectedId: 'one' });
    await writeWorkbenchSettings('workspace-a', 'export', { target: 'zod' });
    expect(await readWorkbenchSettings('workspace-a', 'prototype', {})).toEqual({ selectedId: 'one' });
    expect(await readWorkbenchSettings('workspace-b', 'prototype', {})).toEqual({});
  });

  it('uses an unambiguous versioned key for each workspace and perspective', () => {
    expect(workbenchSettingsKey('workspace:a', 'prototype')).toBe('workbench:["workspace:a","prototype"]:v1');
  });

  it('serializes writes for one setting key', async () => {
    const writes: Array<() => void> = [];
    persistence.saveSetting.mockImplementation(
      (key: string, value: unknown) =>
        new Promise<void>((resolve) => {
          writes.push(() => {
            persistence.values.set(key, value);
            resolve();
          });
        })
    );

    const first = writeWorkbenchSettings('workspace-a', 'prototype', { selectedId: 'first' });
    const second = writeWorkbenchSettings('workspace-a', 'prototype', { selectedId: 'second' });

    expect(persistence.saveSetting).toHaveBeenCalledTimes(1);
    writes[0]?.();
    await first;
    await vi.waitFor(() => expect(persistence.saveSetting).toHaveBeenCalledTimes(2));
    writes[1]?.();
    await second;
    expect(await readWorkbenchSettings('workspace-a', 'prototype', {})).toEqual({ selectedId: 'second' });
  });

  it('waits for queued writes before restoring a setting', async () => {
    let finish!: () => void;
    persistence.saveSetting.mockImplementation(
      (key: string, value: unknown) =>
        new Promise<void>((resolve) => {
          finish = () => {
            persistence.values.set(key, value);
            resolve();
          };
        })
    );

    void writeWorkbenchSettings('workspace-a', 'prototype', { selectedId: 'latest' });
    const restored = readWorkbenchSettings('workspace-a', 'prototype', {});

    await Promise.resolve();
    expect(persistence.loadSetting).not.toHaveBeenCalled();
    finish();
    await expect(restored).resolves.toEqual({ selectedId: 'latest' });
  });

  it('allows a later write to retry after the previous write fails', async () => {
    persistence.saveSetting.mockRejectedValueOnce(new Error('disk full'));

    await expect(writeWorkbenchSettings('workspace-a', 'prototype', { selectedId: 'first' })).rejects.toThrow(
      'disk full'
    );
    await expect(writeWorkbenchSettings('workspace-a', 'prototype', { selectedId: 'retry' })).resolves.toBeUndefined();

    expect(persistence.saveSetting).toHaveBeenCalledTimes(2);
  });
});
