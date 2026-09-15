// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { loadSetting, saveSetting, type WorkbenchSettingKey } from '../workspace/persistence.js';
import { withInstrumentation } from '../services/instrumentation/core.js';

const writeTails = new Map<string, Promise<void>>();

export const workbenchSettingsKey = withInstrumentation(
  function workbenchSettingsKey(workspaceId: string, perspective: string): WorkbenchSettingKey {
    return `workbench:${JSON.stringify([workspaceId, perspective])}:v1`;
  },
  { op: 'workbenchSettingsKey' }
);

export const readWorkbenchSettings = withInstrumentation(
  async function readWorkbenchSettings<T>(workspaceId: string, perspective: string, fallback: T): Promise<T> {
    return (await loadSetting<T>(workbenchSettingsKey(workspaceId, perspective))) ?? fallback;
  },
  { op: 'readWorkbenchSettings' }
);

export const writeWorkbenchSettings = withInstrumentation(
  function writeWorkbenchSettings<T>(workspaceId: string, perspective: string, value: T): Promise<void> {
    const key = workbenchSettingsKey(workspaceId, perspective);
    const previous = writeTails.get(key);
    const write = previous
      ? previous.catch(() => undefined).then(() => saveSetting(key, value))
      : Promise.resolve(saveSetting(key, value));
    const tail = write.then(
      () => undefined,
      () => undefined
    );
    writeTails.set(key, tail);
    void tail.finally(() => {
      if (writeTails.get(key) === tail) writeTails.delete(key);
    });
    return write;
  },
  { op: 'writeWorkbenchSettings' }
);
