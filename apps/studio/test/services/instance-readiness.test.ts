// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { createInstanceReadiness } from '../../src/services/instance-readiness.js';

describe('createInstanceReadiness', () => {
  it('waits for hydrated files to reach the worker', async () => {
    const calls: string[] = [];
    const readiness = createInstanceReadiness({
      findNamespaces: () => ['cdm.base.staticdata.party'],
      hydrate: async (ns) => {
        calls.push(`hydrate:${ns}`);
      },
      waitForWorkerFiles: async () => {
        calls.push('worker-ready');
        return 7;
      }
    });

    expect(await readiness.ensure('cdm.base.staticdata.party.Address', new AbortController().signal)).toBe(7);
    expect(calls).toEqual(['hydrate:cdm.base.staticdata.party', 'worker-ready']);
    readiness.dispose();
  });

  it('sends unknown user types to the worker without inventing a namespace', async () => {
    const calls: string[] = [];
    const readiness = createInstanceReadiness({
      findNamespaces: () => [],
      hydrate: async () => calls.push('hydrate'),
      waitForWorkerFiles: async () => {
        calls.push('worker-ready');
        return 3;
      }
    });

    await expect(readiness.ensure('user.missing.Type', new AbortController().signal)).resolves.toBe(3);
    expect(calls).toEqual(['worker-ready']);
  });

  it('allows a later explicit retry after hydration fails', async () => {
    let attempt = 0;
    const readiness = createInstanceReadiness({
      findNamespaces: () => ['cdm.base.staticdata.party'],
      hydrate: async () => {
        attempt++;
        if (attempt === 1) throw new Error('network unavailable');
      },
      waitForWorkerFiles: async () => 9
    });

    await expect(readiness.ensure('cdm.base.staticdata.party.Address', new AbortController().signal)).rejects.toThrow(
      'network unavailable'
    );
    await expect(readiness.ensure('cdm.base.staticdata.party.Address', new AbortController().signal)).resolves.toBe(9);
  });

  it('hydrates deferred dependencies reported by an otherwise user-authored schema', async () => {
    const calls: string[] = [];
    const readiness = createInstanceReadiness({
      findNamespaces: () => [],
      findNamespacesForUnresolved: (names) => (names.includes('Party') ? ['cdm.party'] : []),
      hydrate: async (namespace) => calls.push(`hydrate:${namespace}`),
      waitForWorkerFiles: async () => {
        calls.push('worker-ready');
        return 4;
      }
    });

    await expect(
      readiness.hydrateSchemaDependencies(
        {
          schemaVersion: 1,
          targetId: 'acme.Trade',
          title: 'Trade',
          status: 'ready',
          fields: [],
          unsupportedFeatures: ['unresolved-reference:Party']
        },
        new AbortController().signal
      )
    ).resolves.toBe(true);
    expect(calls).toEqual(['hydrate:cdm.party', 'worker-ready']);
  });
});
