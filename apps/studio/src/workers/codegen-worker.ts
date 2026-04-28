// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/// <reference lib="webworker" />

/**
 * Codegen Worker (T084/T085).
 *
 * Dedicated worker for running @rune-langium/codegen off the main thread.
 * Accepts two message types:
 *
 *   codegen:setFiles  — Update the workspace file set and trigger generation.
 *   codegen:generate  — (Re-)generate using the current file set.
 *
 * Responds with:
 *   codegen:result   — On success; one message per generated file.
 *   codegen:outdated — When files have validation errors or are not yet loaded.
 */

import type { LangiumDocument } from 'langium';
import { URI } from 'langium';
import { createRuneDslServices } from '@rune-langium/core';
import { generate } from '@rune-langium/codegen';
import type { Target } from '@rune-langium/codegen';

// ---------------------------------------------------------------------------
// Message types (inbound)
// ---------------------------------------------------------------------------

interface FileEntry {
  uri: string;
  content: string;
}

interface SetFilesMessage {
  type: 'codegen:setFiles';
  files: FileEntry[];
}

interface GenerateMessage {
  type: 'codegen:generate';
  target?: Target;
}

type InboundMessage = SetFilesMessage | GenerateMessage;

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

const { RuneDsl } = createRuneDslServices();
const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
const builder = RuneDsl.shared.workspace.DocumentBuilder;

let currentFiles: FileEntry[] = [];
let lastTarget: Target = 'zod';

// ---------------------------------------------------------------------------
// Generation logic
// ---------------------------------------------------------------------------

async function runCodegen(target: Target): Promise<void> {
  const scope = self as unknown as DedicatedWorkerGlobalScope;

  if (currentFiles.length === 0) {
    scope.postMessage({ type: 'codegen:outdated' });
    return;
  }

  try {
    const documents: LangiumDocument[] = currentFiles.map(({ uri, content }) =>
      factory.fromString(content, URI.parse(uri))
    );

    await builder.build(documents, { validation: false });

    const hasErrors = documents.some((doc) =>
      (doc.diagnostics ?? []).some((d) => d.severity === 1)
    );

    if (hasErrors) {
      scope.postMessage({ type: 'codegen:outdated' });
      return;
    }

    const results = generate(documents, { target });

    for (const result of results) {
      scope.postMessage({
        type: 'codegen:result',
        target,
        relativePath: result.relativePath,
        content: result.content,
        sourceMap: result.sourceMap
      });
    }
  } catch (err) {
    console.error('[codegen-worker] Generation error:', err);
    scope.postMessage({ type: 'codegen:outdated' });
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

(self as unknown as DedicatedWorkerGlobalScope).addEventListener(
  'message',
  (e: MessageEvent<InboundMessage>) => {
    const msg = e.data;

    if (msg.type === 'codegen:setFiles') {
      currentFiles = msg.files;
      runCodegen(lastTarget).catch(console.error);
    } else if (msg.type === 'codegen:generate') {
      if (msg.target !== undefined) {
        lastTarget = msg.target;
      }
      runCodegen(lastTarget).catch(console.error);
    }
  }
);
