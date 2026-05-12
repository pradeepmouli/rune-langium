// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  HydrateRequest,
  HydrateResponse,
  WorkerRequest,
  WorkerResponse
} from '../../src/workers/parser-worker.js';

describe('HydrateRequest type', () => {
  it('is included in WorkerRequest union', () => {
    expectTypeOf<HydrateRequest>().toMatchTypeOf<WorkerRequest>();
  });

  it('has documents and exportsByNamespace fields', () => {
    const req: HydrateRequest = {
      type: 'hydrate',
      id: 'h1',
      documents: [{ uri: 'file:///x.rune', content: '', serializedModel: '{}' }],
      exportsByNamespace: { x: [{ type: 'Data', name: 'T', path: 'x.T' }] }
    };
    expectTypeOf(req.documents).toBeArray();
  });
});

describe('HydrateResponse type', () => {
  it('is included in WorkerResponse union', () => {
    expectTypeOf<HydrateResponse>().toMatchTypeOf<WorkerResponse>();
  });
});

describe('hydrate handler', () => {
  it('registers documents and exports such that linkDocument resolves cross-namespace refs', async () => {
    // Drive the worker via postMessage from a test harness.
    // The test harness is at apps/studio/test/workers/parser-worker-harness.ts (NEW in Task 0.2 step 3).
    const { createParserWorkerHarness } = await import('./parser-worker-harness.js');
    const harness = createParserWorkerHarness();

    await harness.send({
      type: 'hydrate',
      id: 'h1',
      documents: [
        {
          uri: 'file:///cdm.base.math.rune',
          content: 'namespace cdm.base.math\ntype Quantity:\n  amount number (1..1)\n',
          serializedModel: harness.serializeSample('cdm.base.math', 'Quantity')
        }
      ],
      exportsByNamespace: {
        'cdm.base.math': [{ type: 'Data', name: 'Quantity', path: 'cdm.base.math.Quantity' }]
      }
    });

    // After hydration, linkDocument against a doc referencing Quantity should resolve.
    const linkResult = await harness.send({
      type: 'linkDocument',
      id: 'l1',
      uri: 'file:///user.rune'
    });

    expect(linkResult.type).toBe('linkDocumentResult');
    expect((linkResult as { errors: string[] }).errors).toHaveLength(0);

    harness.dispose();
  });
});
