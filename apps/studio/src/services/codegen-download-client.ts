// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { withInstrumentation } from './instrumentation/core.js';

export type CodegenDownloadReply =
  | { body: ArrayBuffer; status: number; headers: Array<[string, string]> }
  | { error: string };

/** Curated downloads need more memory than the Pages runtime permits. */
export const requestCodegenDownload = withInstrumentation(
  function requestCodegenDownload(body: Record<string, unknown>): Promise<Response> {
    if (!body.curatedBundles && !body.curatedDocs) {
      return fetch('/api/codegen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }

    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../workers/codegen-download-worker.ts', import.meta.url), { type: 'module' });
      const finish = () => {
        clearTimeout(timeout);
        worker.terminate();
      };
      const timeout = setTimeout(() => {
        finish();
        reject(new Error('Code generation timed out after 120 seconds. Try a smaller namespace selection.'));
      }, 120_000);
      worker.onmessage = (event: MessageEvent<CodegenDownloadReply>) => {
        finish();
        const reply = event.data;
        if ('error' in reply) reject(new Error(reply.error));
        else resolve(new Response(reply.body, { status: reply.status, headers: reply.headers }));
      };
      worker.onerror = (event) => {
        finish();
        reject(new Error(event.message || 'Code generation worker failed'));
      };
      worker.onmessageerror = () => {
        finish();
        reject(new Error('Could not read the generated download'));
      };
      try {
        worker.postMessage(body);
      } catch (error) {
        finish();
        reject(error);
      }
    });
  },
  { op: 'codegenDownload' }
);
