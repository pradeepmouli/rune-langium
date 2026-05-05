// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Parser Web Worker — offloads Rune DSL parsing to a background thread (T097).
 *
 * Accepts messages with { type: 'parse', content: string } or
 * { type: 'parseWorkspace', files: { name: string; content: string }[] }
 * and returns parsed results.
 */

import { createRuneDslServices, RuneDslIndexManager, type RosettaModel } from '@rune-langium/core';
import type { CuratedSerializedDocument } from '@rune-langium/curated-schema';
import { URI, type AstNode, type LangiumDocument } from 'langium';

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
}

export type WorkerRequest = ParseRequest | ParseWorkspaceRequest | LinkDocumentRequest;

export interface ParseResponse {
  type: 'parseResult';
  id: string;
  model: RosettaModel | null;
  errors: string[];
}

export interface ParseWorkspaceResponse {
  type: 'parseWorkspaceResult';
  id: string;
  models: RosettaModel[];
  parsedModels: Array<{ filePath: string; model: RosettaModel }>;
  errors: Record<string, string[]>;
}

export type WorkerResponse = ParseResponse | ParseWorkspaceResponse | LinkDocumentResponse;

const { RuneDsl } = createRuneDslServices();
const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
const builder = RuneDsl.shared.workspace.DocumentBuilder;

// Track the active Langium services used by the most recent parseWorkspace.
// Both corpus and user files now share the same RuneDsl services instance so
// cross-references between them resolve through a unified IndexManager.
let activeBuilder: typeof builder = builder;
let activeLangiumDocs = RuneDsl.shared.workspace.LangiumDocuments;

// Module-level map: URI string → modelJson blob for on-demand deserialization.
// Populated during parseWorkspace for corpus files that have an exports manifest;
// cleared at the start of each workspace load.
const deferredModelJson = new Map<string, string>();

function getIndexManager(): RuneDslIndexManager {
  return RuneDsl.shared.workspace.IndexManager as RuneDslIndexManager;
}

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
    !value.parsedModels.every(
      (entry) => isRecord(entry) && typeof entry.filePath === 'string' && isRecord(entry.model)
    )
  ) {
    return false;
  }
  if (!isRecord(value.errors)) {
    return false;
  }
  return Object.values(value.errors).every(
    (entry) => Array.isArray(entry) && entry.every((message) => typeof message === 'string')
  );
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
    const document = await factory.fromString(
      req.content,
      URI.parse(req.uri ?? 'inmemory:///model.rosetta')
    );
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
    return { type: 'parseWorkspaceResult', id: req.id, models: [], parsedModels: [], errors };
  }

  try {
    const indexManager = getIndexManager();
    const langiumDocs = RuneDsl.shared.workspace.LangiumDocuments;
    const serializer = RuneDsl.serializer.JsonSerializer;
    const documents: LangiumDocument<AstNode>[] = [];
    const models: RosettaModel[] = [];
    const parsedModels: Array<{ filePath: string; model: RosettaModel }> = [];

    // Clear deferred blobs from previous workspace load
    deferredModelJson.clear();

    for (const file of req.files) {
      const uri = URI.parse(file.name);

      if (file.serializedModelJson && file.exports?.length) {
        // Corpus file with exports manifest — register index only, defer AST deserialization
        const descriptions = file.exports.map((exp) => ({
          type: exp.type,
          name: exp.name,
          documentUri: uri,
          path: exp.path
        }));
        indexManager.registerExports(uri, descriptions);
        deferredModelJson.set(uri.toString(), file.serializedModelJson);
        // Do not create a document or add to documents array
      } else if (file.serializedModelJson) {
        // Corpus file WITHOUT exports (old artifact format) — deserialize fully
        const model = serializer.deserialize<RosettaModel>(file.serializedModelJson);
        const doc = factory.fromModel(model, uri);
        langiumDocs.addDocument(doc);
        documents.push(doc);
      } else {
        // User file — parse from source text
        const doc = factory.fromString(file.content, uri);
        documents.push(doc);
      }
    }

    // Build all parsed/deserialized documents with lazy linking
    if (documents.length > 0) {
      await builder.build(documents, { validation: false, eagerLinking: false });
    }

    // Track the active services so linkDocument can find documents from this parse
    activeBuilder = builder;
    activeLangiumDocs = langiumDocs;

    // Collect models from built documents
    for (const document of documents) {
      const model = document.parseResult.value as RosettaModel;
      if (model) {
        preserveCstText(model);
        models.push(model);
        const docUri = document.uri?.toString();
        const matchingFile = req.files.find((f) => URI.parse(f.name).toString() === docUri);
        if (matchingFile) {
          parsedModels.push({ filePath: matchingFile.name, model });
        }
      }
      if (document.parseResult.parserErrors.length > 0) {
        const docUri = document.uri?.toString() ?? '';
        const matchingFile = req.files.find((f) => URI.parse(f.name).toString() === docUri);
        errors[matchingFile?.name ?? docUri] = document.parseResult.parserErrors.map(
          (e: { message: string }) => e.message
        );
      }
    }

    return { type: 'parseWorkspaceResult', id: req.id, models, parsedModels, errors };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[parser-worker] parseWorkspace failed', {
      id: req.id,
      error
    });
    const detail =
      error instanceof Error
        ? [error.message, error.stack].filter(Boolean).join('\n')
        : 'Workspace parsing failed.';
    return {
      type: 'parseWorkspaceResult',
      id: req.id,
      models: [],
      parsedModels: [],
      errors: {
        __worker__: [detail]
      }
    };
  }
}

async function handleLinkDocument(req: LinkDocumentRequest): Promise<LinkDocumentResponse> {
  try {
    const targetUri = URI.parse(req.uri);

    // Check if this is a deferred corpus document that has not been deserialized yet
    const deferredJson = deferredModelJson.get(targetUri.toString());
    if (deferredJson) {
      // On-demand deserialization — first access of this corpus document
      const serializer = RuneDsl.serializer.JsonSerializer;
      const model = serializer.deserialize<RosettaModel>(deferredJson);
      const doc = factory.fromModel(model, targetUri);
      activeLangiumDocs.addDocument(doc);
      deferredModelJson.delete(targetUri.toString()); // Prevent re-deserialization
      await activeBuilder.build([doc], { validation: false, eagerLinking: true });

      const errors: string[] = [];
      for (const diag of doc.diagnostics ?? []) {
        errors.push(diag.message);
      }
      return { type: 'linkDocumentResult', id: req.id, linked: true, errors };
    }

    // Regular document (already parsed and registered during workspace load)
    if (!activeLangiumDocs.hasDocument(targetUri)) {
      return { type: 'linkDocumentResult', id: req.id, linked: false, errors: [] };
    }

    const doc = activeLangiumDocs.getDocument(targetUri);
    if (!doc) {
      return { type: 'linkDocumentResult', id: req.id, linked: false, errors: [] };
    }
    await activeBuilder.build([doc], { validation: false, eagerLinking: true });

    const errors: string[] = [];
    for (const diag of doc.diagnostics ?? []) {
      errors.push(diag.message);
    }
    return { type: 'linkDocumentResult', id: req.id, linked: true, errors };
  } catch (error) {
    return {
      type: 'linkDocumentResult',
      id: req.id,
      linked: false,
      errors: [(error as Error).message]
    };
  }
}

// ---------------------------------------------------------------------------
// Register message listener (only when running as a worker)
// ---------------------------------------------------------------------------

if (typeof self !== 'undefined' && typeof self.onmessage !== 'undefined') {
  self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const req = event.data;
    let response: WorkerResponse;

    if (req.type === 'parse') {
      response = await handleParse(req);
    } else if (req.type === 'parseWorkspace') {
      response = await handleParseWorkspace(req);
    } else if (req.type === 'linkDocument') {
      response = await handleLinkDocument(req);
    } else {
      return;
    }

    self.postMessage(response);
  };
}

export function isLinkDocumentResponse(value: unknown): value is LinkDocumentResponse {
  if (!isRecord(value)) return false;
  return (
    value.type === 'linkDocumentResult' &&
    typeof value.id === 'string' &&
    typeof value.linked === 'boolean' &&
    Array.isArray(value.errors) &&
    value.errors.every((e) => typeof e === 'string')
  );
}

export { handleParse, handleParseWorkspace, handleLinkDocument };
