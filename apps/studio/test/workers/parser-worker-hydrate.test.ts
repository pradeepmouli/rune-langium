// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expectTypeOf } from 'vitest';
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
