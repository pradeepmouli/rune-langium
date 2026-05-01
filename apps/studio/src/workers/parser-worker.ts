// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Parser Web Worker — offloads Rune DSL parsing to a background thread (T097).
 *
 * Accepts messages with { type: 'parse', content: string } or
 * { type: 'parseWorkspace', files: { name: string; content: string }[] }
 * and returns parsed results.
 */

import { createRuneDslServices, type RosettaModel } from '@rune-langium/core';
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
  }>;
}

export type WorkerRequest = ParseRequest | ParseWorkspaceRequest;

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

export type WorkerResponse = ParseResponse | ParseWorkspaceResponse;

const { RuneDsl } = createRuneDslServices();
const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
const builder = RuneDsl.shared.workspace.DocumentBuilder;

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
    await builder.build([document], { validation: false });
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
    const hasSerializedModels = req.files.some(
      (file) => typeof file.serializedModelJson === 'string'
    );
    const workspace = hasSerializedModels
      ? await buildWorkspaceDocumentsFromSerializedPayload(req.files)
      : {
          documents: await Promise.all(
            req.files.map((file) => factory.fromString(file.content, URI.parse(file.name)))
          ),
          builder
        };
    await workspace.builder.build(workspace.documents, { validation: false });
    const models: RosettaModel[] = [];
    const parsedModels: Array<{ filePath: string; model: RosettaModel }> = [];

    for (let i = 0; i < workspace.documents.length; i++) {
      const document = workspace.documents[i]!;
      const file = req.files[i]!;
      const model = document.parseResult.value as RosettaModel;
      if (model) {
        preserveCstText(model);
        models.push(model);
        parsedModels.push({ filePath: file.name, model });
      }
      if (document.parseResult.parserErrors.length > 0) {
        errors[file.name] = document.parseResult.parserErrors.map(
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

async function buildWorkspaceDocumentsFromSerializedPayload(
  files: ParseWorkspaceRequest['files']
): Promise<{
  documents: LangiumDocument<AstNode>[];
  builder: typeof builder;
}> {
  const { RuneDsl: localRuneDsl } = createRuneDslServices();
  const localFactory = localRuneDsl.shared.workspace.LangiumDocumentFactory;
  const localDocuments = localRuneDsl.shared.workspace.LangiumDocuments;
  const localSerializer = localRuneDsl.serializer.JsonSerializer;
  const localBuilder = localRuneDsl.shared.workspace.DocumentBuilder;

  const documents = await Promise.all(
    files.map((file) => {
      const uri = URI.parse(file.name);
      if (file.serializedModelJson) {
        const model = localSerializer.deserialize<RosettaModel>(file.serializedModelJson);
        return localFactory.fromModel(model, uri);
      }
      return localFactory.fromString(file.content, uri);
    })
  );

  for (const document of documents) {
    localDocuments.addDocument(document);
  }

  return { documents, builder: localBuilder };
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
    } else {
      return;
    }

    self.postMessage(response);
  };
}

export { handleParse, handleParseWorkspace };
