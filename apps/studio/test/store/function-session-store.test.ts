// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it, vi } from 'vitest';
import { createFunctionSession } from '../../src/store/function-session-store.js';
import type { PreviewSessionClient } from '../../src/services/preview-session-client.js';
import type { InstanceRecord } from '@rune-langium/codegen/instances';

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

  it('wraps an instance when binding it to a collection input', async () => {
    const client: PreviewSessionClient = {
      schema: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        targetId: 'test.BuildTrade',
        title: 'Build trade',
        status: 'ready',
        kind: 'function',
        fields: [{ path: 'parties', label: 'Parties', kind: 'array', item: { kind: 'object', fields: [] } }]
      }),
      execute: vi.fn(),
      dispose: vi.fn()
    };
    const session = createFunctionSession(client);
    await session.selectFunction('test.BuildTrade');
    session.bindInstance('parties', {
      id: 'party-1',
      name: 'Acme',
      typeFqn: 'test.Party',
      data: { name: 'Acme' }
    } as InstanceRecord);

    expect(session.getState().inputs).toEqual({ parties: [{ name: 'Acme' }] });
  });

  it('invalidates a completed result after changing inputs or binding an instance', async () => {
    const client: PreviewSessionClient = {
      schema: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        targetId: 'test.BuildTrade',
        title: 'Build trade',
        status: 'ready',
        kind: 'function',
        fields: [{ path: 'party', label: 'Party', kind: 'object', fields: [] }]
      }),
      execute: vi.fn().mockResolvedValue({ result: 'old' }),
      dispose: vi.fn()
    };
    const session = createFunctionSession(client);
    await session.selectFunction('test.BuildTrade');
    await session.run();
    session.setInputs({ party: { name: 'New' } });

    expect(session.getState()).toMatchObject({ result: undefined, status: 'idle' });

    await session.run();
    session.bindInstance('party', {
      id: 'party-1',
      name: 'Acme',
      typeFqn: 'test.Party',
      data: { name: 'Acme' }
    } as InstanceRecord);

    expect(session.getState()).toMatchObject({ result: undefined, status: 'idle' });
  });
});
