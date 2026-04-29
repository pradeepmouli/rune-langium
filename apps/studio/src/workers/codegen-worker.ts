// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/// <reference lib="webworker" />

/**
 * Codegen Worker (T084/T085).
 *
 * Dedicated worker for running @rune-langium/codegen off the main thread.
 * Accepts code-preview and form-preview messages, tracks the latest request
 * identity per surface, and only emits results tagged with that request id.
 *
 *   codegen:setFiles  — Update the workspace file set and trigger generation.
 *   codegen:generate  — (Re-)generate using the current file set.
 *   preview:setFiles  — Update the workspace file set and re-run the last preview target.
 *   preview:generate  — (Re-)generate the selected form-preview target.
 *
 * Responds with:
 *   codegen:result   — On success; returns the full generated file set for the target.
 *   codegen:outdated — When files are missing or contain parse errors.
 *   codegen:error    — When generation itself fails unexpectedly.
 *   preview:result   — On success; returns the generated form-preview schema.
 *   preview:stale    — When preview inputs are missing, unsupported, or stale.
 */

import type { LangiumDocument } from 'langium';
import { URI } from 'langium';
import { createRuneDslServices } from '@rune-langium/core';
import { generate, generatePreviewSchemas } from '@rune-langium/codegen';
import type { Target } from '@rune-langium/codegen';
import type { PreviewWorkerRequest } from '../services/codegen-service.js';

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
  requestId?: string;
}

interface GenerateMessage {
  type: 'codegen:generate';
  target?: Target;
  requestId?: string;
}

type InboundMessage = SetFilesMessage | GenerateMessage;
type WorkerInboundMessage = InboundMessage | PreviewWorkerRequest;

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

const { RuneDsl } = createRuneDslServices();
const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
const builder = RuneDsl.shared.workspace.DocumentBuilder;

let currentFiles: FileEntry[] = [];
let lastTarget: Target = 'zod';
let lastCodegenRequestId: string | undefined;
let lastPreviewTargetId: string | undefined;
let lastPreviewRequestId: string | undefined;

// ---------------------------------------------------------------------------
// Generation logic
// ---------------------------------------------------------------------------

async function runCodegen(target: Target, requestId?: string): Promise<void> {
  const scope = self as unknown as DedicatedWorkerGlobalScope;

  if (currentFiles.length === 0) {
    scope.postMessage({
      type: 'codegen:outdated',
      target,
      requestId,
      message: 'No files are loaded for code preview.'
    });
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
      scope.postMessage({
        type: 'codegen:outdated',
        target,
        requestId,
        message: 'Fix model errors to refresh the code preview.'
      });
      return;
    }

    const results = generate(documents, { target });

    scope.postMessage({
      type: 'codegen:result',
      target,
      requestId,
      files: results.map((result) => ({
        relativePath: result.relativePath,
        content: result.content,
        sourceMap: result.sourceMap
      }))
    });
  } catch (err) {
    console.error('[codegen-worker] Generation error:', err);
    scope.postMessage({
      type: 'codegen:error',
      target,
      requestId,
      message: err instanceof Error ? err.message : 'Code generation failed.'
    });
  }
}

async function buildDocuments(): Promise<LangiumDocument[] | null> {
  if (currentFiles.length === 0) {
    return null;
  }

  const documents: LangiumDocument[] = currentFiles.map(({ uri, content }) =>
    factory.fromString(content, URI.parse(uri))
  );

  await builder.build(documents, { validation: false });

  const hasErrors = documents.some((doc) => (doc.diagnostics ?? []).some((d) => d.severity === 1));
  return hasErrors ? null : documents;
}

async function runPreview(targetId: string, requestId: string): Promise<void> {
  const scope = self as unknown as DedicatedWorkerGlobalScope;

  if (currentFiles.length === 0) {
    scope.postMessage({
      type: 'preview:stale',
      targetId,
      requestId,
      reason: 'no-files',
      message: 'No files are loaded for form preview.'
    });
    return;
  }

  try {
    const documents = await buildDocuments();
    if (!documents) {
      scope.postMessage({
        type: 'preview:stale',
        targetId,
        requestId,
        reason: 'parse-error',
        message: 'Fix model errors to refresh the form preview.'
      });
      return;
    }

    const [schema] = generatePreviewSchemas(documents, { targetId });
    if (!schema) {
      scope.postMessage({
        type: 'preview:stale',
        targetId,
        requestId,
        reason: 'unsupported-target',
        message: `No form preview schema is available for ${targetId}.`
      });
      return;
    }

    scope.postMessage({ type: 'preview:result', targetId, requestId, schema });
  } catch (err) {
    console.error('[codegen-worker] Preview generation error:', err);
    scope.postMessage({
      type: 'preview:stale',
      targetId,
      requestId,
      reason: 'generation-error',
      message: err instanceof Error ? err.message : 'Preview generation failed.'
    });
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

(self as unknown as DedicatedWorkerGlobalScope).addEventListener(
  'message',
  (e: MessageEvent<WorkerInboundMessage>) => {
    const msg = e.data;

    if (msg.type === 'codegen:setFiles') {
      currentFiles = msg.files;
      runCodegen(lastTarget, lastCodegenRequestId).catch(console.error);
    } else if (msg.type === 'codegen:generate') {
      if (msg.target !== undefined) {
        lastTarget = msg.target;
      }
      if (msg.requestId) {
        lastCodegenRequestId = msg.requestId;
      }
      runCodegen(lastTarget, lastCodegenRequestId).catch(console.error);
    } else if (msg.type === 'preview:setFiles') {
      currentFiles = msg.files;
      if (msg.requestId) {
        lastPreviewRequestId = msg.requestId;
      }
      if (lastPreviewTargetId) {
        runPreview(lastPreviewTargetId, lastPreviewRequestId ?? 'preview:stale').catch(
          console.error
        );
      }
    } else if (msg.type === 'preview:generate') {
      lastPreviewTargetId = msg.targetId;
      lastPreviewRequestId = msg.requestId;
      runPreview(msg.targetId, msg.requestId).catch(console.error);
    }
  }
);
