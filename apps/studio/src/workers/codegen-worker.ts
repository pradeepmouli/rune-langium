// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/// <reference lib="webworker" />

/**
 * Dedicated worker for running @rune-langium/codegen off the main thread.
 * Accepts code-preview and form-preview messages, tracks the latest request
 * identity per surface, and echoes request ids back so the UI can discard
 * stale replies after files or selections change.
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

interface PreviewExecuteMessage {
  type: 'preview:execute';
  funcName: string;
  inputs: Record<string, unknown>;
  requestId: string;
}

type InboundMessage = SetFilesMessage | GenerateMessage;
type WorkerInboundMessage = InboundMessage | PreviewWorkerRequest | PreviewExecuteMessage;

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
let cachedFuncCode = new Map<string, string>();

function hasDocumentErrors(document: LangiumDocument): boolean {
  const hasDiagnostics = (document.diagnostics ?? []).some(
    (diagnostic) => diagnostic.severity === 1
  );
  const hasLexerErrors = document.parseResult.lexerErrors.length > 0;
  const hasParserErrors = document.parseResult.parserErrors.length > 0;
  return hasDiagnostics || hasLexerErrors || hasParserErrors;
}

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

    const hasErrors = documents.some(hasDocumentErrors);

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

    // Cache generated function code for preview:execute
    if (target === 'typescript') {
      cachedFuncCode = new Map();
      for (const result of results) {
        for (const func of result.funcs) {
          cachedFuncCode.set(func.name, result.content);
        }
      }
    }

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

  const hasErrors = documents.some(hasDocumentErrors);
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
// Function execution
// ---------------------------------------------------------------------------

async function executeFunction(
  funcName: string,
  inputs: Record<string, unknown>,
  requestId: string
): Promise<void> {
  const scope = self as unknown as DedicatedWorkerGlobalScope;

  if (!cachedFuncCode.has(funcName)) {
    const documents = await buildDocuments();
    if (documents) {
      const results = generate(documents, { target: 'typescript' });
      cachedFuncCode = new Map();
      for (const result of results) {
        for (const func of result.funcs) {
          cachedFuncCode.set(func.name, result.content);
        }
      }
    }
  }

  if (!cachedFuncCode.has(funcName)) {
    scope.postMessage({
      type: 'preview:execute-error',
      requestId,
      funcName,
      error: `Function '${funcName}' not found in generated code. Ensure the model has a valid func declaration and no parse errors.`
    });
    return;
  }

  const code = cachedFuncCode.get(funcName)!;

  try {
    // Strip TS-only syntax to get evaluable JS.
    // The generated code is close to valid JS — type annotations are the main difference.
    // Security: this runs in a dedicated web worker with no DOM/network/FS access.
    const jsCode = code
      .replace(/^export /gm, '')
      .replace(/(\w+)\s*:\s*[A-Z]\w*(?:Shape)?(?:\[\])?\s*(?=[,)])/g, '$1')
      .replace(/\)\s*:\s*[A-Za-z]\w*(?:\[\])?\s*\{/g, ') {')
      .replace(/\s+as\s+typeof\s+this\.\w+/g, '')
      .replace(/\s+as\s+const/g, '')
      .replace(/^(?:interface|type)\s+\w+[^{]*\{[^}]*\}/gm, '')
      .replace(/^type\s+\w+\s*=\s*[^;]+;/gm, '')
      .replace(/^class\s+\w+[\s\S]*?^}/gm, '');

    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const wrapper = new Function(
      'input',
      `${jsCode}\nreturn typeof ${funcName} === 'function' ? ${funcName}(input) : undefined;`
    );

    const output = wrapper(inputs);

    scope.postMessage({
      type: 'preview:execute-result',
      requestId,
      funcName,
      output
    });
  } catch (e) {
    scope.postMessage({
      type: 'preview:execute-error',
      requestId,
      funcName,
      error: e instanceof Error ? e.message : String(e)
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
      if (msg.requestId) {
        lastCodegenRequestId = msg.requestId;
      }
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
      const requestId = msg.requestId ?? lastPreviewRequestId;
      if (lastPreviewTargetId && requestId) {
        runPreview(lastPreviewTargetId, requestId).catch(console.error);
      }
    } else if (msg.type === 'preview:generate') {
      lastPreviewTargetId = msg.targetId;
      lastPreviewRequestId = msg.requestId;
      runPreview(msg.targetId, msg.requestId).catch(console.error);
    } else if (msg.type === 'preview:execute') {
      const { funcName, inputs, requestId } = msg;
      executeFunction(funcName, inputs, requestId).catch(console.error);
    }
  }
);
