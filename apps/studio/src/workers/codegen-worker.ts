// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/// <reference lib="webworker" />

/**
 * Dedicated worker for running @rune-langium/codegen off the main thread.
 * Accepts code-preview and form-preview messages, tracks the latest request
 * identity per surface, and echoes request ids back so the UI can discard
 * stale replies after files or selections change.
 *
 *   codegen:setFiles         — Update the workspace file set and trigger generation.
 *   codegen:generate         — (Re-)generate using the current file set.
 *   preview:setFiles         — Update the workspace file set and re-run the last preview target.
 *   preview:generate         — (Re-)generate the selected form-preview target.
 *   instance:validate        — Validate an instance's data against its type's structural + condition rules.
 *   instance:generateSchema  — Fetch a FormPreviewSchema for instance-editing, on its OWN request/response
 *                              pair — deliberately NOT `preview:generate`/`preview:result`, so it never
 *                              touches `lastPreviewTargetId`/`lastPreviewRequestId` (finding #6/#7 fix;
 *                              those touch the target `preview:setFiles` re-runs on a workspace file
 *                              change, and previously an instance schema fetch could silently corrupt it).
 *
 * Responds with:
 *   codegen:result              — On success; returns the full generated file set for the target.
 *   codegen:outdated            — When files are missing or contain parse errors.
 *   codegen:error                — When generation itself fails unexpectedly.
 *   preview:result               — On success; returns the generated form-preview schema.
 *   preview:stale                — When preview inputs are missing, unsupported, or stale.
 *   instance:validateResult      — Structural + condition diagnostics for an `instance:validate` request.
 *   instance:generateSchemaResult — On success; returns the generated form-preview schema.
 *   instance:generateSchemaStale  — When schema inputs are missing, unsupported, or stale.
 */

import type { LangiumDocument } from 'langium';
import { URI } from 'langium';
import { createRuneDslServices, hydrateModelDocument } from '@rune-langium/core';
import { generate, generatePreviewSchemas, RUNTIME_HELPER_JS_SOURCE } from '@rune-langium/codegen/export';
import type { Target } from '@rune-langium/codegen/export';
import { findDataNode, getActiveConditionPredicates } from '@rune-langium/codegen/instances';
import type { ValidationDiagnostic } from '@rune-langium/codegen/instances';
import type { PreviewWorkerRequest } from '../services/codegen-service.js';
import { validatePreviewSample } from '../services/preview-validator.js';
import { isWorkerGlobalScope } from './runtime-guards.js';

// ---------------------------------------------------------------------------
// Message types (inbound)
// ---------------------------------------------------------------------------

interface FileEntry {
  uri: string;
  content: string;
  /**
   * Pre-serialized Langium AST for curated bundle files. When present,
   * `buildDocuments` deserializes this directly instead of parsing
   * `content` (which is empty for curated refOnly entries). 019
   * Task #88 follow-up.
   */
  serializedModelJson?: string;
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

interface InstanceValidateMessage {
  type: 'instance:validate';
  typeFqn: string;
  data: Record<string, unknown>;
  requestId: string;
}

interface InstanceGenerateSchemaMessage {
  type: 'instance:generateSchema';
  typeFqn: string;
  requestId: string;
}

type InboundMessage = SetFilesMessage | GenerateMessage;
type WorkerInboundMessage =
  | InboundMessage
  | PreviewWorkerRequest
  | PreviewExecuteMessage
  | InstanceValidateMessage
  | InstanceGenerateSchemaMessage;

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

function isPreviewUserEntryParseable(entry: FileEntry): boolean {
  const lowerUri = entry.uri.toLowerCase();
  // Defensive guard: preview input should only parse real source files.
  // List-only curated refs use synthetic extensionless URIs plus empty content;
  // routing them through Langium's parser triggers "no services for the
  // extension ''". Hydrated curated entries are handled separately through
  // `serializedModelJson`.
  return lowerUri.endsWith('.rosetta') && entry.content.trim().length > 0;
}

function hasDocumentErrors(document: LangiumDocument): boolean {
  const hasDiagnostics = (document.diagnostics ?? []).some((diagnostic) => diagnostic.severity === 1);
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

    const results = await generate(documents, { target });

    // 018 Task 0.7 follow-up — when every output carries an error
    // diagnostic AND no content (the shape returned by `runGenerate`
    // for not-yet-implemented targets), surface it as `codegen:error`
    // so the panel shows "Preview unavailable" instead of misleading
    // "Generated (X)" with empty content.
    const allOutputsAreErrors =
      results.length > 0 && results.every((r) => r.content === '' && r.diagnostics.some((d) => d.severity === 'error'));
    if (allOutputsAreErrors) {
      const firstError = results[0]!.diagnostics.find((d) => d.severity === 'error');
      scope.postMessage({
        type: 'codegen:error',
        target,
        requestId,
        message: firstError?.message ?? 'Code generation produced only errors.'
      });
      return;
    }

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

  // 019 Task #88 follow-up: split into user files (parse path) and
  // curated files (deserialize path). Curated entries arrive with
  // `serializedModelJson` set (the pre-parsed Langium AST) and
  // `content === ''` — parsing an empty string would produce a parse
  // error and the doc would be filtered out, leaving form preview
  // unable to find curated types. Hydrate them via the serializer
  // instead.
  const userEntries = currentPreviewFiles.filter((e) => !e.serializedModelJson && isPreviewUserEntryParseable(e));
  const curatedEntries = currentPreviewFiles.filter((e) => Boolean(e.serializedModelJson));

  const userDocuments: LangiumDocument[] = userEntries.map(({ uri, content }) =>
    factory.fromString(content, URI.parse(uri))
  );
  if (userDocuments.length > 0) {
    await builder.build(userDocuments, { validation: false, eagerLinking: false });
  }

  // Curated docs come pre-linked from the curated-mirror build (CI runs
  // Langium with a higher heap budget than the browser can spare).
  // Build here would try to re-link and fail because the live Langium
  // service hasn't indexed cross-references.
  //
  // Codex review on PR #169: use `factory.fromModel` + add to the
  // service's document store. The earlier synthetic doc literal
  // (`{ uri, parseResult: { value, [], [] } }`) skipped Langium's
  // LangiumDocument ownership, which `RuneDslLinker.loadAstNode`
  // relies on to resolve cross-references through `.ref`. For curated
  // models with typed fields, refs would silently fail to resolve and
  // the preview / codegen output would be missing typed children.
  const curatedDocuments: LangiumDocument[] = [];
  for (const entry of curatedEntries) {
    try {
      const { document } = hydrateModelDocument(
        { RuneDsl, shared: RuneDsl.shared },
        URI.parse(entry.uri),
        entry.serializedModelJson!,
        { register: 'idempotent' }
      );
      curatedDocuments.push(document);
    } catch (err) {
      console.warn(`[codegen-worker] Failed to deserialize curated AST for ${entry.uri}; excluded from preview.`, err);
    }
  }

  // Filter out user files with parse/lex errors. Corpus files may
  // contain constructs the parser doesn't fully support; excluding them
  // keeps the namespace index intact for the remaining files.
  const validUserDocuments = userDocuments.filter((d) => !hasDocumentErrors(d));
  if (validUserDocuments.length < userDocuments.length) {
    console.warn(
      `[codegen-worker] ${
        userDocuments.length - validUserDocuments.length
      } user file(s) had parse errors and were excluded from preview.`
    );
  }
  return [...validUserDocuments, ...curatedDocuments];
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

/**
 * Instance-editing's schema fetches (finding #6/#7 fix) — deliberately
 * separate from `runPreview`: it does NOT read or write module-level
 * `lastPreviewTargetId`/`lastPreviewRequestId`, so it can never corrupt
 * which target `preview:setFiles` re-runs for the Preview perspective.
 * Reuses `buildDocuments`/`generatePreviewSchemas`, the same structural
 * source `runPreview` and `validateInstance` already use.
 */
async function runInstanceSchema(typeFqn: string, requestId: string): Promise<void> {
  const scope = self as unknown as DedicatedWorkerGlobalScope;

  if (currentPreviewFiles.length === 0) {
    scope.postMessage({
      type: 'instance:generateSchemaStale',
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
        type: 'instance:generateSchemaStale',
        requestId,
        reason: 'parse-error',
        message: 'No valid files to generate a form preview from.'
      });
      return;
    }

    const [schema] = generatePreviewSchemas(documents, { targetId: typeFqn });
    if (!schema) {
      scope.postMessage({
        type: 'instance:generateSchemaStale',
        requestId,
        reason: 'unsupported-target',
        message: `No form preview schema is available for ${typeFqn}.`
      });
      return;
    }

    scope.postMessage({ type: 'instance:generateSchemaResult', requestId, schema });
  } catch (err) {
    console.error('[codegen-worker] Instance schema generation error:', err);
    scope.postMessage({
      type: 'instance:generateSchemaStale',
      requestId,
      reason: 'generation-error',
      message: err instanceof Error ? err.message : 'Instance schema generation failed.'
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
    cleaned = cleaned.replace(/((?:const|let|var)\s+\w+)\s*:\s*[\w.<>()[\] |&?,]+\s*(=|;)/g, '$1 $2');

    // Strip type casts
    cleaned = cleaned.replace(/\s+as\s+typeof\s+this\.\w+/g, '');
    cleaned = cleaned.replace(/\s+as\s+const/g, '');
    cleaned = cleaned.replace(/\s+as\s+\w+/g, '');

    output.push(cleaned);
  }

  return output.join('\n');
}

// ---------------------------------------------------------------------------
// Hardened `new Function(...)` execution — shared sandbox wrapper
// ---------------------------------------------------------------------------

/**
 * Runs `jsSource` (with the runtime-helper bundle prepended) inside
 * `new Function(...)`, evaluates `returnExpr` as the final statement, and
 * returns its result. `argValue` is bound to the parameter named `argName`
 * inside that source.
 *
 * The `new Function(...)` constructor evaluates the given source in a
 * dedicated module-level scope, but it is NOT a sandbox:
 * - Identifier shadowing (`fetch`, `WebSocket`, `XMLHttpRequest`, `importScripts`
 *   passed as params) prevents direct calls to those names from the evaluated
 *   code, but `globalThis.fetch` etc. remain reachable.
 * - Other Worker globals (`postMessage`, `self`, `addEventListener`) are not
 *   shadowed.
 * - This worker runs in a dedicated Web Worker context, so the blast radius is
 *   limited to that worker, but the evaluated code can still exfil via globalThis.
 * - For stronger isolation, rely on the Cloudflare Workers / browser CSP to
 *   block network egress at the runtime level.
 *
 * Shared by `executeFunction` (generated Rune func bodies) and the
 * `instance:validate` handler (condition predicates) — the single hardened-
 * execution path in this worker; do not add a second one.
 *
 * react-doctor false positive: this is `new Function`, not `eval`, but the rule
 * flags both. Disable comment preserved.
 */
// eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
// react-doctor-disable-next-line react-doctor/no-eval
function runInWorkerSandbox(jsSource: string, argName: string, argValue: unknown, returnExpr: string): unknown {
  const wrapper = new Function(
    argName,
    'fetch',
    'WebSocket',
    'XMLHttpRequest',
    'importScripts',
    `${RUNTIME_HELPER_JS_SOURCE}\n\n${jsSource}\nreturn ${returnExpr};`
  );
  return wrapper(argValue, undefined, undefined, undefined, undefined);
}

// ---------------------------------------------------------------------------
// Function execution
// ---------------------------------------------------------------------------

async function executeFunction(funcName: string, inputs: Record<string, unknown>, requestId: string): Promise<void> {
  const scope = self as unknown as DedicatedWorkerGlobalScope;

  if (!cachedFuncCode.has(funcName)) {
    const documents = await buildDocuments();
    if (documents.length > 0) {
      const results = await generate(documents, { target: 'typescript' });
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
    // only needs to handle inline type syntax. Execution goes through
    // runInWorkerSandbox — see its threat-model comment.
    const output = runInWorkerSandbox(
      stripTypeAnnotations(code),
      'input',
      inputs,
      `typeof ${funcName} === 'function' ? ${funcName}(input) : undefined`
    );

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
// Instance validation
// ---------------------------------------------------------------------------

async function validateInstance(typeFqn: string, data: Record<string, unknown>, requestId: string): Promise<void> {
  const scope = self as unknown as DedicatedWorkerGlobalScope;

  try {
    const documents = await buildDocuments();
    // `findDataNode` only searches Data types — it returns undefined for a
    // Choice target even though `generatePreviewSchemas` (the structural
    // validator source) supports Choice targets too. Only condition-
    // predicate extraction genuinely needs the Data AST node; structural
    // validation must proceed for any target `generatePreviewSchemas` can
    // resolve, Choice included. "Unknown type" is only correct when NEITHER
    // resolves the target.
    const dataNode = findDataNode(typeFqn, documents);
    const [schema] = generatePreviewSchemas(documents, { targetId: typeFqn });
    if (!dataNode && !schema) {
      scope.postMessage({
        type: 'instance:validateResult',
        requestId,
        diagnostics: [{ path: '', message: `Unknown type '${typeFqn}'` }]
      });
      return;
    }

    const structural = validatePreviewSample(
      schema ?? { schemaVersion: 1, targetId: typeFqn, title: dataNode!.name, status: 'ready', fields: [] },
      data
    );
    const structuralDiagnostics: ValidationDiagnostic[] = Object.entries(structural.errors).map(([path, message]) => ({
      path,
      message
    }));

    // Condition predicates are the same plain-JS boolean strings
    // transpileCondition() emits into `.refine((data) => <predicate>, ...)`
    // for the zod target — executed here through runInWorkerSandbox so
    // runeAttrExists/runeCount/etc. are in scope. Only Data targets carry
    // conditions; a Choice target (no `dataNode`) has none to evaluate.
    const conditionDiagnostics: ValidationDiagnostic[] = dataNode
      ? getActiveConditionPredicates(dataNode)
          .filter(({ predicate }) => !runInWorkerSandbox('', 'data', data, `(${predicate})`))
          .map(({ name }) => ({ path: name, message: `Condition '${name}' failed`, conditionName: name }))
      : [];

    scope.postMessage({
      type: 'instance:validateResult',
      requestId,
      diagnostics: [...structuralDiagnostics, ...conditionDiagnostics]
    });
  } catch (err) {
    console.error('[codegen-worker] Instance validation error:', err);
    scope.postMessage({
      type: 'instance:validateResult',
      requestId,
      diagnostics: [{ path: '', message: err instanceof Error ? err.message : 'Instance validation failed.' }]
    });
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

// Gate the listener behind `isWorkerGlobalScope()` (shared with parser-worker
// via ./runtime-guards.ts). Currently no main-bundle code statically imports
// this module, but the moment something does — e.g. a re-export of a type
// definition — the unguarded `self.addEventListener` would re-create the
// same `TypeError: Cannot read properties of undefined (reading 'type')`
// crash that PR #214 fixed for parser-worker.
if (isWorkerGlobalScope()) {
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
      } else if (msg.type === 'instance:validate') {
        const { typeFqn, data, requestId } = msg;
        validateInstance(typeFqn, data, requestId).catch(console.error);
      } else if (msg.type === 'instance:generateSchema') {
        const { typeFqn, requestId } = msg;
        runInstanceSchema(typeFqn, requestId).catch(console.error);
      }
    }
  );
}
