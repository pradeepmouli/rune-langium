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
import { createRuneDslServices, hydrateModelDocuments } from '@rune-langium/core';
import { generate, generatePreviewSchemas, RUNTIME_HELPER_JS_SOURCE } from '@rune-langium/codegen/export';
import type { Target, FormPreviewSchema, GeneratorOutput } from '@rune-langium/codegen/export';
import { findDataNode, getActiveConditionPredicates } from '@rune-langium/codegen/instances';
import type { ValidationDiagnostic } from '@rune-langium/codegen/instances';
import type { PreviewWorkerRequest } from '../services/codegen-service.js';
import { validatePreviewSample } from '../services/preview-validator.js';
import { isWorkerGlobalScope } from './runtime-guards.js';
import { installInstrumentationWorkerSink } from '../services/instrumentation/worker-sink.js';

// Gated behind `isWorkerGlobalScope()` for the same reason as the message
// listener at the bottom of this file: no main-bundle code statically
// imports this module today, but the moment something does (e.g. a
// re-exported type), an unguarded top-level `installInstrumentationWorkerSink`
// would run during that main-thread import with `self` being `window` and
// hijack the main thread's `configureInstrumentation` slot away from the
// browser sink installed at bootstrap (PR #214 precedent).
if (isWorkerGlobalScope()) {
  installInstrumentationWorkerSink((msg) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg));
}

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
let previewFilesVersion = 0;
const documentsCache = new Map<string, VersionedEntry<LangiumDocument[]>>();
const previewSchemaCache = new Map<string, VersionedEntry<FormPreviewSchema[]>>();
const previewGenerateCache = new Map<string, VersionedEntry<GeneratorOutput[]>>();
let codegenFilesVersion = 0;
const codegenGenerateCache = new Map<string, VersionedEntry<GeneratorOutput[]>>();

// Curated documents are relinked as a BATCH once per `preview:setFiles`
// (the only message that ever carries new curated content) and cached here
// for `buildDocuments()` to read on every `runPreview`/`runInstanceSchema`/
// `executeFunction`/`validateInstance` call. See `hydrateCuratedDocuments`.
let cachedCuratedDocuments: LangiumDocument[] = [];
let lastCuratedEntries: FileEntry[] = [];

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

function curatedEntriesChanged(next: FileEntry[]): boolean {
  if (next.length !== lastCuratedEntries.length) return true;
  return next.some((entry, i) => {
    const prev = lastCuratedEntries[i];
    return !prev || prev.uri !== entry.uri || prev.serializedModelJson !== entry.serializedModelJson;
  });
}

/**
 * Relinks curated documents as a batch via `hydrateModelDocuments`
 * (`packages/core`'s bounded multi-round delete-then-re-add fixpoint —
 * see its doc comment) and caches the result in `cachedCuratedDocuments`
 * for `buildDocuments()` to read.
 *
 * Called once per `preview:setFiles` — the only message that ever carries
 * new curated content (`codegen:setFiles` carries user-authored files
 * only) — NOT from inside `buildDocuments()` itself, which runs on every
 * `runPreview`/`runInstanceSchema`/`executeFunction`/`validateInstance`
 * call and would turn this batch relink (up to 8 re-deserialize rounds
 * over every curated entry) into a real performance regression versus the
 * old idempotent per-entry lookup.
 *
 * `serializedModelJson` strings are passed through unchanged from the main
 * thread for a given curated document (they're immutable per-session
 * snapshots). `curatedEntriesChanged` compares them with `!==`, which for
 * string primitives is always a full value comparison (JS strings have no
 * separate "reference identity" the way objects do) — so this is a
 * complete content comparison of the curated set on every
 * `preview:setFiles`, not a cheap identity check. It is still far cheaper
 * than running the relink unconditionally, which is the actual cost this
 * guards against.
 */
function hydrateCuratedDocuments(entries: FileEntry[]): void {
  const curatedEntries = entries.filter((e) => Boolean(e.serializedModelJson));
  if (!curatedEntriesChanged(curatedEntries)) return; // identical set — skip the relink entirely
  lastCuratedEntries = curatedEntries;
  try {
    cachedCuratedDocuments = hydrateModelDocuments(
      { RuneDsl, shared: RuneDsl.shared },
      curatedEntries.map((entry) => ({ uri: entry.uri, json: entry.serializedModelJson! }))
    ).map((r) => r.document);
  } catch (err) {
    // hydrateModelDocuments does not isolate per-entry deserialize failures
    // the way the old per-entry loop did (one bad curated doc now skips the
    // whole curated batch for this build rather than just itself). Accepted
    // trade-off — see design doc §Background/Root Cause. If this proves too
    // coarse in practice, add per-entry isolation to hydrateModelDocuments
    // itself in packages/core, not a local workaround here (DRY).
    console.warn('[codegen-worker] Failed to hydrate curated documents; excluded from preview.', err);
    cachedCuratedDocuments = [];
  }
}

// ---------------------------------------------------------------------------
// Versioned cache primitive
// ---------------------------------------------------------------------------

/**
 * Every cache in this file is invalidated by comparing a stored version
 * number against a live counter (`previewFilesVersion`/`codegenFilesVersion`)
 * bumped whenever the relevant file set changes — never by content hashing
 * or a TTL.
 */
interface VersionedEntry<T> {
  version: number;
  value: T;
}

/**
 * Returns the full `VersionedEntry`, not just its `value` — callers that
 * feed this result into a FURTHER downstream cache (e.g. `buildDocuments()`'s
 * result feeding `previewSchemaCache`/`previewGenerateCache`) must tag that
 * downstream entry with the version returned here, not with whatever the
 * live counter reads at that later point. Re-sampling the live counter
 * after this call already reflects a file-set change that this specific
 * result predates — see `getOrComputeAsync`'s own doc comment for the
 * concrete failure mode.
 */
function getOrCompute<T>(
  cache: Map<string, VersionedEntry<T>>,
  key: string,
  version: number,
  compute: () => T
): VersionedEntry<T> {
  const cached = cache.get(key);
  if (cached && cached.version === version) return cached;
  const entry: VersionedEntry<T> = { version, value: compute() };
  // Never let a write tagged with a STALE version (an out-of-order caller
  // whose own input predates a concurrently-already-cached, newer entry —
  // see this function's doc comment) clobber that newer entry. This call's
  // own request is still answered with a freshly-computed, correctly-tagged
  // result; it just isn't allowed to regress the shared cache.
  if (!cached || cached.version < version) {
    cache.set(key, entry);
  }
  return entry;
}

/**
 * Async variant. Captures `getVersion()` BEFORE awaiting `compute()`, and
 * tags the result with that captured version regardless of what `getVersion()`
 * reads once `compute()` resolves.
 *
 * The write guard compares against the CACHE's own current state, not
 * `getVersion()` re-invoked — mirrors `getOrCompute`'s guard above. Re-reading
 * `getVersion()` here would work for a caller passing a live counter
 * (`buildDocuments()`'s `() => previewFilesVersion`) but is a no-op for a
 * caller passing a closure over an already-fixed version (`executeFunction`/
 * `runCodegen`'s `() => documentsVersion`, threaded forward from an earlier
 * `getOrComputeAsync` call per this cache's own doc comment) — that closure
 * returns the same value both before and after `await compute()`, so the
 * "still current?" check would trivially always pass, letting an
 * out-of-order caller (started under an older version, but whose OWN
 * `compute()` — e.g. `generate()` — takes longer than a concurrent newer
 * call's) overwrite an already-cached newer entry with its stale one. The
 * cache-state comparison catches this uniformly for both kinds of callers.
 *
 * Returns the full `VersionedEntry`, tagged with `versionAtStart` even when
 * the write was skipped — callers that feed this result into a FURTHER
 * downstream cache must tag that entry with THIS version, not the live
 * counter (see `getOrCompute`'s doc comment for the concrete failure mode).
 * `buildDocuments()`, `executeFunction`, and `runCodegen` all thread this
 * returned `version` forward into their own `getOrCompute`/`getOrComputeAsync`
 * calls for exactly this reason.
 */
async function getOrComputeAsync<T>(
  cache: Map<string, VersionedEntry<T>>,
  key: string,
  getVersion: () => number,
  compute: () => Promise<T>
): Promise<VersionedEntry<T>> {
  const versionAtStart = getVersion();
  const cached = cache.get(key);
  if (cached && cached.version === versionAtStart) return cached;
  const value = await compute();
  const entry: VersionedEntry<T> = { version: versionAtStart, value };
  const cachedNow = cache.get(key);
  if (!cachedNow || cachedNow.version < versionAtStart) {
    cache.set(key, entry);
  }
  return entry;
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
    // Captured before the only `await` below, mirroring buildDocuments()'s
    // own guard — a codegen:setFiles that arrives while this call is
    // suspended in builder.build bumps codegenFilesVersion out from under
    // `documents`, which is already stale by then. Tagging the downstream
    // codegenGenerateCache write with THIS captured version (not the live
    // counter re-sampled after the build) ensures a stale-derived result
    // is never marked valid for the new version.
    const documentsVersion = codegenFilesVersion;

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

    const { value: results } = await getOrComputeAsync(
      codegenGenerateCache,
      target,
      () => documentsVersion,
      () => generate(documents, { target })
    );

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

async function buildDocuments(): Promise<VersionedEntry<LangiumDocument[]>> {
  return getOrComputeAsync(
    documentsCache,
    'documents',
    () => previewFilesVersion,
    async () => {
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
      //
      // The batch relink itself already ran once in `hydrateCuratedDocuments`
      // (called from the `preview:setFiles` handler) — this just reads the
      // cached result rather than re-registering/re-linking on every build.
      const curatedDocuments = cachedCuratedDocuments;

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
  );
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
    const { version: documentsVersion, value: documents } = await buildDocuments();
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

    // Tagged with `documentsVersion` (the version `documents` was ACTUALLY
    // built from), not the live `previewFilesVersion` — a `buildDocuments()`
    // call suspended across a `preview:setFiles` returns documents that
    // predate the live counter; caching under the live counter would mark
    // that stale-derived schema as valid for the new version.
    const {
      value: [schema]
    } = getOrCompute(previewSchemaCache, targetId, documentsVersion, () =>
      generatePreviewSchemas(documents, { targetId })
    );
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
    const { version: documentsVersion, value: documents } = await buildDocuments();
    if (documents.length === 0) {
      scope.postMessage({
        type: 'instance:generateSchemaStale',
        requestId,
        reason: 'parse-error',
        message: 'No valid files to generate a form preview from.'
      });
      return;
    }

    // See runPreview's identical comment — tagged with documentsVersion,
    // not the live previewFilesVersion.
    const {
      value: [schema]
    } = getOrCompute(previewSchemaCache, typeFqn, documentsVersion, () =>
      generatePreviewSchemas(documents, { targetId: typeFqn })
    );
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
function runInWorkerSandbox(jsSource: string, argName: string, argValue: unknown, returnExpr: string): unknown {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  // react-doctor-disable-next-line react-doctor/no-eval
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

  const { version: documentsVersion, value: documents } = await buildDocuments();
  // Tagged with documentsVersion (fixed — `documents` is an immutable local
  // array once obtained, so no further staleness can be introduced during
  // this call), not the live previewFilesVersion — see runPreview's
  // identical comment for why re-sampling the live counter here would be
  // wrong.
  const results =
    documents.length > 0
      ? (
          await getOrComputeAsync(
            previewGenerateCache,
            'generate:typescript',
            () => documentsVersion,
            () => generate(documents, { target: 'typescript' })
          )
        ).value
      : [];

  // Matches both the bare function name and the namespace-qualified form
  // (`${ns}.${func.name}`, derived the same way runCodegen's own cache
  // population always did) — real callers (e.g. preview-store.ts's
  // dispatchExecute) pass the qualified form.
  let code: string | undefined;
  for (const result of results) {
    const ns = result.relativePath.replace(/\//g, '.').replace(/\.ts$/, '');
    const func = result.funcs.find((f) => f.name === funcName || `${ns}.${f.name}` === funcName);
    if (func) {
      code = func.fileContents;
      break;
    }
  }

  if (code === undefined) {
    scope.postMessage({
      type: 'preview:execute-error',
      requestId,
      funcName,
      error: `Function '${funcName}' not found in generated code. Ensure the model has a valid func declaration and no parse errors.`
    });
    return;
  }

  try {
    // Strip TS type annotations from the isolated function body stored in
    // func.fileContents. This contains only the function declaration — no
    // imports, interface blocks, or helper declarations — so stripTypeAnnotations
    // only needs to handle inline type syntax. Execution goes through
    // runInWorkerSandbox — see its threat-model comment.
    // `code`'s declaration is always the BARE function name regardless of
    // whether `funcName` (the caller's request) was qualified — the return
    // expression below must call by that same bare name.
    const bareName = funcName.includes('.') ? funcName.slice(funcName.lastIndexOf('.') + 1) : funcName;
    const output = runInWorkerSandbox(
      stripTypeAnnotations(code),
      'input',
      inputs,
      `typeof ${bareName} === 'function' ? ${bareName}(input) : undefined`
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
    const { version: documentsVersion, value: documents } = await buildDocuments();
    // `findDataNode` only searches Data types — it returns undefined for a
    // Choice target even though `generatePreviewSchemas` (the structural
    // validator source) supports Choice targets too. Only condition-
    // predicate extraction genuinely needs the Data AST node; structural
    // validation must proceed for any target `generatePreviewSchemas` can
    // resolve, Choice included. "Unknown type" is only correct when NEITHER
    // resolves the target.
    const dataNode = findDataNode(typeFqn, documents);
    // See runPreview's identical comment — tagged with documentsVersion,
    // not the live previewFilesVersion.
    const {
      value: [schema]
    } = getOrCompute(previewSchemaCache, typeFqn, documentsVersion, () =>
      generatePreviewSchemas(documents, { targetId: typeFqn })
    );
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
    const conditionDiagnostics: ValidationDiagnostic[] = [];
    if (dataNode) {
      for (const { name, predicate } of getActiveConditionPredicates(dataNode)) {
        if (!runInWorkerSandbox('', 'data', data, `(${predicate})`)) {
          conditionDiagnostics.push({ path: name, message: `Condition '${name}' failed`, conditionName: name });
        }
      }
    }

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
        codegenFilesVersion++;
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
        hydrateCuratedDocuments(msg.files);
        currentPreviewFiles = msg.files;
        previewFilesVersion++;
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
