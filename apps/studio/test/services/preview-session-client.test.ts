// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it, vi } from 'vitest';
import { createPreviewSessionClient } from '../../src/services/preview-session-client.js';
import type { InstanceReadiness } from '../../src/services/instance-readiness.js';

class FakeWorker extends EventTarget {
  readonly posted: Array<Record<string, unknown>> = [];
  postMessage(message: Record<string, unknown>): void {
    this.posted.push(message);
  }
  reply(message: Record<string, unknown>): void {
    this.dispatchEvent(new MessageEvent('message', { data: message }));
  }
}

function readiness(): InstanceReadiness {
  return { ensure: vi.fn(async () => 1), dispose: vi.fn() };
}

describe('createPreviewSessionClient', () => {
  it('keeps simultaneous execution replies correlated when they arrive in reverse order', async () => {
    const worker = new FakeWorker();
    const first = createPreviewSessionClient(worker as unknown as Worker, readiness());
    const second = createPreviewSessionClient(worker as unknown as Worker, readiness());
    const a = first.execute('test.Rename', { name: 'A' }, new AbortController().signal);
    const b = second.execute('test.Rename', { name: 'B' }, new AbortController().signal);
    await vi.waitFor(() => expect(worker.posted).toHaveLength(2));

    worker.reply({
      type: 'preview:execute-result',
      requestId: worker.posted[1].requestId,
      funcName: 'test.Rename',
      output: 'B'
    });
    worker.reply({
      type: 'preview:execute-result',
      requestId: worker.posted[0].requestId,
      funcName: 'test.Rename',
      output: 'A'
    });

    await expect(a).resolves.toBe('A');
    await expect(b).resolves.toBe('B');
  });

  it('rejects an aborted request and ignores its eventual reply', async () => {
    const worker = new FakeWorker();
    const client = createPreviewSessionClient(worker as unknown as Worker, readiness());
    const controller = new AbortController();
    const result = client.execute('test.Rename', {}, controller.signal);
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    worker.reply({
      type: 'preview:execute-result',
      requestId: worker.posted[0].requestId,
      funcName: 'test.Rename',
      output: 'late'
    });
  });

  it('rejects pending requests when the worker fails', async () => {
    const worker = new FakeWorker();
    const client = createPreviewSessionClient(worker as unknown as Worker, readiness());
    const result = client.execute('test.Rename', {}, new AbortController().signal);
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));

    worker.dispatchEvent(new Event('error'));

    await expect(result).rejects.toThrow('Function execution worker is unavailable.');
  });
});
