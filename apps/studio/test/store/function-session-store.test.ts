// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it, vi } from 'vitest';
import { createFunctionSession } from '../../src/store/function-session-store.js';
import type { PreviewSessionClient } from '../../src/services/preview-session-client.js';

describe('createFunctionSession', () => {
  it('drops a stale result after selecting another function', async () => {
    let resolveFirst!: (value: unknown) => void;
    const client: PreviewSessionClient = {
      schema: vi.fn(async (fqn) => ({
        schemaVersion: 1,
        targetId: fqn,
        title: fqn,
        status: 'ready',
        kind: 'function',
        fields: []
      })),
      execute: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      ),
      dispose: vi.fn()
    };
    const session = createFunctionSession(client);
    await session.selectFunction('test.First');
    const running = session.run();
    await session.selectFunction('test.Second');
    resolveFirst('stale');
    await running;

    expect(session.getState()).toMatchObject({ functionFqn: 'test.Second', result: undefined, status: 'idle' });
  });
});
