// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Parser Web Worker — offloads Rune DSL parsing to a background thread (T097).
 *
 * Accepts messages with { type: 'parse', content: string } or
 * { type: 'parseWorkspace', files: { name: string; content: string }[] }
 * and returns parsed results.
 */

import {
  createRuneDslServices,
  RuneDslIndexManager,
  namespaceFromSource,
  type DeferredModelProvider,
  type RosettaModel
} from '@rune-langium/core';
import type { CuratedSerializedDocument } from '@rune-langium/curated-schema';
import { URI, EmptyFileSystem, type AstNode, type AstNodeDescription, type LangiumDocument } from 'langium';
import { isWorkerGlobalScope } from './runtime-guards.js';

export interface ParseRequest {
  type: 'parse';
  id: string;
  content: string;
  /** Optional document URI (e.g. system:// for base-type files). */
  uri?: string;
}

export interface ParseWorkspaceRequest {
  type: 'parseWorkspace';
  id: string;
  files: Array<{
    name: string;
    content: string;
    serializedModelJson?: CuratedSerializedDocument['modelJson'];
    exports?: Array<{ type: string; name: string; path: string }>;
  }>;
}

export interface LinkDocumentRequest {
  type: 'linkDocument';
  id: string;
  uri: string;
}

export interface LinkDocumentResponse {
  type: 'linkDocumentResult';
  id: string;
  linked: boolean;
  errors: string[];
  /** Corpus models that were lazily deserialized during this link request. */
  newModels: RosettaModel[];
}

export interface HydrateRequest {
  type: 'hydrate';
  id: string;
  /** Documents to register with the deferred-model provider, each with its own exports for the index. */
  documents: Array<{
    uri: string;
    content: string;
    /** Serialized langium AST as JSON string (from JsonSerializer.serialize). */
    serializedModel: string;
    /** Export descriptions for the symbol index, scoped to this document. */
    exports: Array<{ type: string; name: string; path: string }>;
    /**
     * Set on curated-bundle entries (added by /api/parse:functions/api/parse.ts).
     * Absent on user-file entries. The studio uses this to mark workspace
     * files refOnly without parsing URI prefixes — prefix inference
     * false-positives when a user file lives under `${bundleId}/...`.
     */
    bundleId?: string;
  }>;
}

export interface HydrateResponse {
  type: 'hydrateResult';
  id: string;
  ok: boolean;
  error?: string;
}

export type WorkerRequest = ParseRequest | ParseWorkspaceRequest | LinkDocumentRequest | HydrateRequest;

export interface ParseResponse {
  type: 'parseResult';
  id: string;
  model: RosettaModel | null;
  errors: string[];
}

export interface DeferredExportEntry {
  filePath: string;
  namespace: string;
  exports: Array<{ type: string; name: string }>;
}

export interface ParseWorkspaceResponse {
  type: 'parseWorkspaceResult';
  id: string;
  models: RosettaModel[];
  parsedModels: Array<{ filePath: string; model: RosettaModel }>;
  errors: Record<string, string[]>;
  deferredExports: DeferredExportEntry[];
  /**
   * Optional curated-bundle file map produced ONLY by the routed parse path
   * (workspace.ts:parseWorkspaceViaRouter). Lets the studio populate
   * LoadedModel.files with reference-only entries so the file count and
   * picker reflect curated bundle contents even though source text isn't
   * available client-side. The in-worker parseWorkspace path doesn't set
   * this — workers can't fetch curated bundles directly.
   */
  curatedRefOnlyFiles?: Record<string, import('../types/model-types.js').CachedFile[]>;
}

export type WorkerResponse = ParseResponse | ParseWorkspaceResponse | LinkDocumentResponse | HydrateResponse;

// Deferred corpus model map: URI string → raw JSON (never deserialized until needed).
// Populated by handleParseWorkspace, consumed lazily by RuneDslLinker.loadAstNode
// when Langium resolves cross-references during handleLinkDocument.
const deferredModelJson = new Map<string, string>();

// Initialised after createRuneDslServices() below — safe because getModel is only
// called during build(), which happens inside handleLinkDocument (post-init).
let serializer: { deserialize<T extends AstNode>(content: string): T };

// Accumulates models deserialized via the deferred provider during a single
// handleLinkDocument call so they can be returned in LinkDocumentResponse.newModels.
// Reset at the start of each handleLinkDocument call.
let newModelsAccumulator: RosettaModel[] = [];

const deferredProvider: DeferredModelProvider = {
  getModel(uri: string): AstNode | undefined {
    const json = deferredModelJson.get(uri);
    if (json === undefined) return undefined;
    const model = serializer.deserialize<RosettaModel>(json);
    newModelsAccumulator.push(model);
    return model;
  },
  consume(uri: string): void {
    deferredModelJson.delete(uri);
  }
};

const { RuneDsl } = createRuneDslServices(EmptyFileSystem, deferredProvider);
const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
const builder = RuneDsl.shared.workspace.DocumentBuilder;
const indexManager = RuneDsl.shared.workspace.IndexManager as RuneDslIndexManager;
serializer = RuneDsl.serializer.JsonSerializer;

// Track the active Langium services used by the most recent parseWorkspace.
let activeBuilder: typeof builder = builder;
let activeLangiumDocs = RuneDsl.shared.workspace.LangiumDocuments;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export function isParseResponse(value: unknown): value is ParseResponse {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.type === 'parseResult' &&
    typeof value.id === 'string' &&
    Array.isArray(value.errors) &&
    value.errors.every((entry) => typeof entry === 'string') &&
    (value.model === null || isRecord(value.model))
  );
}

export function isParseWorkspaceResponse(value: unknown): value is ParseWorkspaceResponse {
  if (!isRecord(value) || value.type !== 'parseWorkspaceResult' || typeof value.id !== 'string') {
    return false;
  }
  if (!Array.isArray(value.models) || !value.models.every((entry) => isRecord(entry))) {
    return false;
  }
  if (
    !Array.isArray(value.parsedModels) ||
    !value.parsedModels.every((entry) => isRecord(entry) && typeof entry.filePath === 'string' && isRecord(entry.model))
  ) {
    return false;
  }
  if (!isRecord(value.errors)) {
    return false;
  }
  if (
    !Object.values(value.errors).every(
      (entry) => Array.isArray(entry) && entry.every((message) => typeof message === 'string')
    )
  ) {
    return false;
  }
  if (!Array.isArray(value.deferredExports)) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// CST text preservation — $cstNode is lost during postMessage serialization
// (structured clone can't handle circular refs). Save the text as $cstText.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function preserveCstText(model: any): void {
  for (const elem of model?.elements ?? []) {
    // Function body parts: shortcuts, conditions, operations, postConditions
    if (elem.$type === 'RosettaFunction') {
      for (const arr of [elem.shortcuts, elem.conditions, elem.operations, elem.postConditions]) {
        for (const part of arr ?? []) {
          if (part?.$cstNode?.text) {
            part.$cstText = part.$cstNode.text;
          }
          // Also preserve expression-level text for the expression builder
          if (part?.expression?.$cstNode?.text) {
            part.expression.$cstText = part.expression.$cstNode.text;
          }
        }
      }
    }
    // Data/Choice conditions
    if (elem.conditions) {
      for (const cond of elem.conditions) {
        if (cond?.$cstNode?.text) {
          cond.$cstText = cond.$cstNode.text;
        }
        if (cond?.expression?.$cstNode?.text) {
          cond.expression.$cstText = cond.expression.$cstNode.text;
        }
      }
    }
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Worker message handler
// ---------------------------------------------------------------------------

async function handleParse(req: ParseRequest): Promise<ParseResponse> {
  try {
    const document = await factory.fromString(req.content, URI.parse(req.uri ?? 'inmemory:///model.rosetta'));
    await builder.build([document], { validation: false, eagerLinking: false });
    const errors: string[] = [];
    if (document.parseResult.parserErrors.length > 0) {
      for (const err of document.parseResult.parserErrors) {
        errors.push(err.message);
      }
    }
    const model = document.parseResult.value as RosettaModel;
    if (model) preserveCstText(model);
    return { type: 'parseResult', id: req.id, model, errors };
  } catch (e) {
    return {
      type: 'parseResult',
      id: req.id,
      model: null,
      errors: [(e as Error).message]
    };
  }
}

async function handleParseWorkspace(req: ParseWorkspaceRequest): Promise<ParseWorkspaceResponse> {
  const errors: Record<string, string[]> = {};
  if (req.files.length === 0) {
    return {
      type: 'parseWorkspaceResult',
      id: req.id,
      models: [],
      parsedModels: [],
      errors,
      deferredExports: []
    };
  }

  try {
    const langiumDocs = RuneDsl.shared.workspace.LangiumDocuments;
    const userDocs: LangiumDocument<AstNode>[] = [];
    const models: RosettaModel[] = [];
    const parsedModels: Array<{ filePath: string; model: RosettaModel }> = [];
    const deferredExports: DeferredExportEntry[] = [];

    // Drop all corpus JSON from the previous workspace load.
    deferredModelJson.clear();

    // Clear previously registered documents (prevents "already present" collision).
    if (langiumDocs.all) {
      for (const doc of langiumDocs.all.toArray()) {
        langiumDocs.deleteDocument(doc.uri);
      }
    }

    for (const file of req.files) {
      const uri = URI.parse(file.name);
      if (langiumDocs.hasDocument(uri)) langiumDocs.deleteDocument(uri);

      // DEPRECATED (019 Phase 0): pre-parsed corpus content no longer flows through
      // this path. The server-side /api/parse Pages Function fetches curated bundles
      // from curated-mirror directly and returns them in hydrationState. This branch
      // remains as a transition shim during 019 rollout; remove in a follow-up spec
      // once the router is the only production path for parseWorkspace. The
      // `.bundle-marker` synthetic file entries (workspace.ts BUNDLE_MARKER_SUFFIX)
      // also flow through this branch with `serializedModelJson: '{}'` and content '',
      // which the deferred-model machinery handles harmlessly.
      if (file.serializedModelJson) {
        // Corpus file — store raw JSON for lazy deserialization by RuneDslLinker.
        // Nothing is deserialized or added to LangiumDocuments here.
        deferredModelJson.set(uri.toString(), file.serializedModelJson);

        if (file.exports?.length) {
          // Register export stubs in IndexManager so Langium's scope provider can
          // locate corpus types when building cross-references in user documents.
          const descriptions: AstNodeDescription[] = file.exports.map((exp) => ({
            type: exp.type,
            name: exp.name,
            path: exp.path,
            documentUri: uri
          }));
          indexManager.registerExports(uri, descriptions);

          // Emit namespace-explorer stubs for the UI (no Langium involvement).
          const ns = namespaceFromSource(file.content);
          deferredExports.push({
            filePath: file.name,
            namespace: ns,
            exports: file.exports.map((exp) => ({ type: exp.type, name: exp.name }))
          });
        }
      } else {
        // User file — parse from source text and register in LangiumDocuments.
        const doc = factory.fromString(file.content, uri);
        langiumDocs.addDocument(doc);
        userDocs.push(doc);
      }
    }

    // Build user docs with eagerLinking: false — indexed but not yet linked.
    // Corpus docs are never built here; RuneDslLinker handles them on demand.
    if (userDocs.length > 0) {
      await builder.build(userDocs, { validation: false, eagerLinking: false });
    }

    // Track the active services so linkDocument can find documents from this parse.
    activeBuilder = builder;
    activeLangiumDocs = langiumDocs;

    // Pre-build URI→file name map to avoid O(N²) lookup in the collection loop.
    const uriToFileName = new Map<string, string>();
    for (const file of req.files) {
      uriToFileName.set(URI.parse(file.name).toString(), file.name);
    }

    // User files populate both models[] and parsedModels[].
    // Corpus models are not included here — they are not yet deserialized.
    for (const document of userDocs) {
      const model = document.parseResult.value as RosettaModel;
      if (model) {
        preserveCstText(model);
        models.push(model);
        const fileName = uriToFileName.get(document.uri?.toString() ?? '');
        if (fileName) parsedModels.push({ filePath: fileName, model });
      }
      if (document.parseResult.parserErrors.length > 0) {
        const docUri = document.uri?.toString() ?? '';
        const fileName = uriToFileName.get(docUri) ?? docUri;
        errors[fileName] = document.parseResult.parserErrors.map((e: { message: string }) => e.message);
      }
    }

    return {
      type: 'parseWorkspaceResult',
      id: req.id,
      models,
      parsedModels,
      errors,
      deferredExports
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[parser-worker] parseWorkspace failed', {
      id: req.id,
      error
    });
    const detail =
      error instanceof Error ? [error.message, error.stack].filter(Boolean).join('\n') : 'Workspace parsing failed.';
    return {
      type: 'parseWorkspaceResult',
      id: req.id,
      models: [],
      parsedModels: [],
      errors: {
        __worker__: [detail]
      },
      deferredExports: []
    };
  }
}

async function handleLinkDocument(req: LinkDocumentRequest): Promise<LinkDocumentResponse> {
  newModelsAccumulator = [];
  try {
    const targetUri = URI.parse(req.uri);
    let doc: LangiumDocument<AstNode> | undefined;

    // Corpus documents are stored as raw JSON until first link request.
    // Materialize the target document now if it hasn't been deserialized yet.
    if (deferredModelJson.has(targetUri.toString())) {
      const json = deferredModelJson.get(targetUri.toString())!;
      const model = serializer.deserialize<RosettaModel>(json);
      newModelsAccumulator.push(model);
      doc = factory.fromModel(model, targetUri);
      activeLangiumDocs.addDocument(doc);
      deferredModelJson.delete(targetUri.toString());
    } else if (activeLangiumDocs.hasDocument(targetUri)) {
      doc = activeLangiumDocs.getDocument(targetUri);
    }

    if (!doc) {
      return { type: 'linkDocumentResult', id: req.id, linked: false, errors: [], newModels: [] };
    }

    // eagerLinking: true runs Langium's linker immediately.
    // RuneDslLinker.loadAstNode handles transitive corpus deps on demand,
    // each calling deferredProvider.getModel() which appends to newModelsAccumulator.
    await activeBuilder.build([doc], { validation: false, eagerLinking: true });

    const errors: string[] = [];
    for (const diag of doc.diagnostics ?? []) {
      errors.push(diag.message);
    }
    return {
      type: 'linkDocumentResult',
      id: req.id,
      linked: true,
      errors,
      newModels: newModelsAccumulator
    };
  } catch (error) {
    return {
      type: 'linkDocumentResult',
      id: req.id,
      linked: false,
      errors: [(error as Error).message],
      newModels: []
    };
  }
}

async function handleHydrate(req: HydrateRequest): Promise<HydrateResponse> {
  try {
    // Hydrate has REPLACEMENT semantics (mirror handleParseWorkspace's reset).
    // Without this, switching/reloading workspaces leaves stale entries in
    // deferredModelJson, the symbol index, and LangiumDocuments — and
    // linkDocument can still resolve symbols for files that disappeared from
    // the workspace. Reset state first, then register the new set.
    const langiumDocs = RuneDsl.shared.workspace.LangiumDocuments;
    if (langiumDocs.all) {
      for (const doc of langiumDocs.all.toArray()) {
        langiumDocs.deleteDocument(doc.uri);
      }
    }
    for (const previousUri of deferredModelJson.keys()) {
      indexManager.clearExports(URI.parse(previousUri));
    }
    deferredModelJson.clear();

    // Register each document using a single canonical URI for both the deferred-model
    // store and the symbol index, so deferredProvider.getModel() and registerExports()
    // always agree on the key.
    for (const doc of req.documents) {
      const uri = URI.parse(doc.uri);
      deferredModelJson.set(uri.toString(), doc.serializedModel);
      if (doc.exports?.length) {
        const descriptions: AstNodeDescription[] = doc.exports.map((e) => ({
          type: e.type,
          name: e.name,
          path: e.path,
          documentUri: uri
        }));
        indexManager.registerExports(uri, descriptions);
      }
    }
    return { type: 'hydrateResult', id: req.id, ok: true };
  } catch (err) {
    return {
      type: 'hydrateResult',
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

// ---------------------------------------------------------------------------
// Exported dispatcher — testable in Node without spinning up a Web Worker
// ---------------------------------------------------------------------------

export async function dispatchWorkerRequest(req: WorkerRequest): Promise<WorkerResponse> {
  switch (req.type) {
    case 'parse':
      return handleParse(req);
    case 'parseWorkspace':
      return handleParseWorkspace(req);
    case 'linkDocument':
      return handleLinkDocument(req);
    case 'hydrate':
      return handleHydrate(req);
  }
}

// ---------------------------------------------------------------------------
// Register message listener (only when running as a worker)
// ---------------------------------------------------------------------------

// `isWorkerGlobalScope` lives in ./runtime-guards.ts so that every worker
// module in this directory can share the same gate (see PR #214 — the prod
// regression that motivated the shared helper).
if (isWorkerGlobalScope()) {
  self.addEventListener('message', async (e: MessageEvent<WorkerRequest>) => {
    const response = await dispatchWorkerRequest(e.data);
    self.postMessage(response);
  });
}

export function isLinkDocumentResponse(value: unknown): value is LinkDocumentResponse {
  if (!isRecord(value)) return false;
  return (
    value.type === 'linkDocumentResult' &&
    typeof value.id === 'string' &&
    typeof value.linked === 'boolean' &&
    Array.isArray(value.errors) &&
    value.errors.every((e) => typeof e === 'string') &&
    Array.isArray(value.newModels)
  );
}

export { handleParse, handleParseWorkspace, handleLinkDocument };

// Test-only accessors. Exported for use by parser-worker-harness.ts.
// Not part of the worker's public message API.
export function _testInternals() {
  return {
    deferredModelJson,
    services: RuneDsl
  };
}
