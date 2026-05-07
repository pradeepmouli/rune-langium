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
import { generate, generatePreviewSchemas, RUNTIME_HELPER_JS_SOURCE } from '@rune-langium/codegen';
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

let currentCodegenFiles: FileEntry[] = [];
let currentPreviewFiles: FileEntry[] = [];
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

  if (currentCodegenFiles.length === 0) {
    scope.postMessage({
      type: 'codegen:outdated',
      target,
      requestId,
      message: 'No files are loaded for code preview.'
    });
    return;
  }

  try {
    const documents: LangiumDocument[] = currentCodegenFiles.map(({ uri, content }) =>
      factory.fromString(content, URI.parse(uri))
    );

    await builder.build(documents, { validation: false, eagerLinking: false });

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

    // Cache generated function code for preview:execute, keyed by namespace.funcName.
    // Store func.fileContents (isolated function declaration only) rather than
    // result.content (full file with imports, interfaces, helper declarations) so
    // that stripTypeAnnotations only has to handle a plain function body — no TS
    // constructs that would cause a SyntaxError at execution time.
    if (target === 'typescript') {
      cachedFuncCode = new Map();
      for (const result of results) {
        const ns = result.relativePath.replace(/\//g, '.').replace(/\.ts$/, '');
        for (const func of result.funcs) {
          cachedFuncCode.set(func.name, func.fileContents);
          cachedFuncCode.set(`${ns}.${func.name}`, func.fileContents);
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

async function buildDocuments(): Promise<LangiumDocument[]> {
  if (currentPreviewFiles.length === 0) {
    return [];
  }

  const documents: LangiumDocument[] = currentPreviewFiles.map(({ uri, content }) =>
    factory.fromString(content, URI.parse(uri))
  );

  await builder.build(documents, { validation: false, eagerLinking: false });

  // Filter out files with parse/lex errors rather than aborting entirely.
  // Corpus files may contain constructs the parser doesn't fully support;
  // excluding them keeps the namespace index intact for the remaining files.
  const valid = documents.filter((d) => !hasDocumentErrors(d));
  if (valid.length < documents.length) {
    console.warn(
      `[codegen-worker] ${documents.length - valid.length} file(s) had parse errors and were excluded from preview.`
    );
  }
  return valid;
}

async function runPreview(targetId: string, requestId: string): Promise<void> {
  const scope = self as unknown as DedicatedWorkerGlobalScope;

  if (currentPreviewFiles.length === 0) {
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
    if (documents.length === 0) {
      scope.postMessage({
        type: 'preview:stale',
        targetId,
        requestId,
        reason: 'parse-error',
        message: 'No valid files to generate a form preview from.'
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
// TS → JS stripping for @rune-langium/codegen output
// ---------------------------------------------------------------------------

function stripTypeAnnotations(tsCode: string): string {
  const lines = tsCode.split('\n');
  const output: string[] = [];

  for (const line of lines) {
    // Drop the export keyword — functions cached from func.fileContents are
    // declared at top scope and will be referenced by name after the body.
    let cleaned = line.replace(/^export\s+/, '');

    // Strip object literal type annotations in parameters:
    // (param: { field: Type })  →  (param)
    cleaned = cleaned.replace(/(\w+)\??\s*:\s*\{[^{}]*\}\s*(?=[,)])/g, '$1');

    // Strip union/intersection/array/generic type annotations in parameters:
    // (param: TypeA | TypeB[], param2?: Generic<T>)  →  (param, param2)
    cleaned = cleaned.replace(/(\w+)\??\s*:\s*[\w.<>()[\] |&?,]+\s*(?=[,)])/g, '$1');

    // Strip arrow function return type: ): ReturnType =>  →  ) =>
    cleaned = cleaned.replace(/\)\s*:\s*[\w.<>()[\] |&?,]+\s*=>/g, ') =>');

    // Strip regular function/method return type: ): ReturnType {  →  ) {
    cleaned = cleaned.replace(/\)\s*:\s*[\w.<>()[\] |&?| ]+\s*\{/g, ') {');
    cleaned = cleaned.replace(/\)\s*:\s*\w+\s+is\s+\w+\s*\{/g, ') {');

    // Strip variable type annotations: let/const x: Type = or let x: Type;
    cleaned = cleaned.replace(
      /((?:const|let|var)\s+\w+)\s*:\s*[\w.<>()[\] |&?,]+\s*(=|;)/g,
      '$1 $2'
    );

    // Strip type casts
    cleaned = cleaned.replace(/\s+as\s+typeof\s+this\.\w+/g, '');
    cleaned = cleaned.replace(/\s+as\s+const/g, '');
    cleaned = cleaned.replace(/\s+as\s+\w+/g, '');

    output.push(cleaned);
  }

  return output.join('\n');
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
    if (documents.length > 0) {
      const results = generate(documents, { target: 'typescript' });
      cachedFuncCode = new Map();
      for (const result of results) {
        for (const func of result.funcs) {
          cachedFuncCode.set(func.name, func.fileContents);
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
    // Strip TS type annotations from the isolated function body stored in
    // func.fileContents. This contains only the function declaration — no
    // imports, interface blocks, or helper declarations — so stripTypeAnnotations
    // only needs to handle inline type syntax.
    // Prepend plain-JS runtime helpers so runeCheckOneOf / runeCount /
    // runeAttrExists are available without any TypeScript annotation.
    // Security: execution runs in a dedicated web worker (no DOM/network/FS).
    const jsCode = RUNTIME_HELPER_JS_SOURCE + '\n\n' + stripTypeAnnotations(code);

    // Shadow globals that could exfiltrate data from the worker sandbox
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const wrapper = new Function(
      'input',
      'fetch',
      'WebSocket',
      'XMLHttpRequest',
      'importScripts',
      `${jsCode}\nreturn typeof ${funcName} === 'function' ? ${funcName}(input) : undefined;`
    );

    const output = wrapper(inputs, undefined, undefined, undefined, undefined);

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
      currentCodegenFiles = msg.files;
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
      currentPreviewFiles = msg.files;
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
