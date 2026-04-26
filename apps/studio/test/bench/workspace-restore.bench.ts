// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Workspace restore benchmark (T119).
 *
 * Measures the IndexedDB roundtrip cost of restoring a workspace
 * record with multiple tabs (the multi-file path) and listing recents
 * (the multi-tab broadcast surface). Backed by `fake-indexeddb` so the
 * bench is deterministic and runs in jsdom.
 *
 * Acceptance: SC-002 — multi-file + multi-tab restore must complete
 * inside the 5-second budget. The fake-indexeddb numbers are not
 * directly comparable to a real browser, but they bound the
 * persistence layer's own overhead. A regression here always shows
 * up in real browsers.
 *
 * Run with `pnpm --filter @rune-langium/studio exec vitest bench`.
 */

import 'fake-indexeddb/auto';
import { bench, describe } from 'vitest';
import {
  saveWorkspace,
  loadWorkspace,
  listRecents,
  _resetForTests,
  type WorkspaceRecord,
  type PanelLayoutRecord,
  type TabRecord
} from '../../src/workspace/persistence.js';

const TAB_COUNT = 50;
const WORKSPACE_COUNT = 20;

const layout: PanelLayoutRecord = {
  version: 1,
  writtenBy: '0.1.0',
  dockview: { panels: [] }
};

function makeTabs(count: number): TabRecord[] {
  const out: TabRecord[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      path: `/src/module-${i}/file-${i}.rosetta`,
      order: i,
      dirty: i % 7 === 0
    });
  }
  return out;
}

function makeWorkspace(id: string, name: string, tabs: number): WorkspaceRecord {
  return {
    id,
    name,
    createdAt: '2026-04-25T12:00:00Z',
    lastOpenedAt: '2026-04-25T12:00:00Z',
    layout,
    tabs: makeTabs(tabs),
    activeTabPath: '/src/module-0/file-0.rosetta',
    curatedModels: [],
    schemaVersion: 1,
    kind: 'browser-only'
  };
}

describe('workspace restore (T119)', () => {
  bench(
    `loadWorkspace with ${TAB_COUNT} tabs (single roundtrip)`,
    async () => {
      await _resetForTests();
      const ws = makeWorkspace('bench-ws', 'Bench WS', TAB_COUNT);
      await saveWorkspace(ws);
      const back = await loadWorkspace('bench-ws');
      if (!back) throw new Error('expected a workspace back');
    },
    { time: 1000, iterations: 10 }
  );

  bench(
    `listRecents with ${WORKSPACE_COUNT} entries`,
    async () => {
      await _resetForTests();
      for (let i = 0; i < WORKSPACE_COUNT; i++) {
        await saveWorkspace(makeWorkspace(`ws-${i}`, `WS ${i}`, 5));
      }
      const recents = await listRecents();
      if (recents.length !== WORKSPACE_COUNT) {
        throw new Error(`expected ${WORKSPACE_COUNT} recents, got ${recents.length}`);
      }
    },
    { time: 1000, iterations: 5 }
  );

  bench(
    `multi-file restore — load + listRecents fan-out`,
    async () => {
      await _resetForTests();
      for (let i = 0; i < WORKSPACE_COUNT; i++) {
        await saveWorkspace(makeWorkspace(`ws-${i}`, `WS ${i}`, TAB_COUNT));
      }
      // Restore path: read recents, then deep-load the first one.
      const recents = await listRecents();
      const first = recents[0]!;
      const ws = await loadWorkspace(first.id);
      if (!ws) throw new Error('missing workspace');
    },
    { time: 1500, iterations: 5 }
  );
});
