// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { getOpLogSnapshot, type OpLogEntry } from './op-log.js';
import { withInstrumentation } from './instrumentation/core.js';

export interface RuneStudioOpLogBridge {
  snapshot(): OpLogEntry[];
}

declare global {
  interface Window {
    __runeStudioOpLog?: RuneStudioOpLogBridge;
  }
}

export const installOpLogWindowBridge = withInstrumentation(
  function installOpLogWindowBridge(): void {
    window.__runeStudioOpLog = {
      snapshot: getOpLogSnapshot
    };
  },
  { op: 'installOpLogWindowBridge' }
);
