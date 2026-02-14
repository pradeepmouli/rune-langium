/**
 * Parser Web Worker — offloads Rune DSL parsing to a background thread (T097).
 *
 * Accepts messages with { type: 'parse', content: string } or
 * { type: 'parseWorkspace', files: { name: string; content: string }[] }
 * and returns parsed results.
 */

import { parse } from '@rune-langium/core';

export interface ParseRequest {
  type: 'parse';
  id: string;
  content: string;
}

export interface ParseWorkspaceRequest {
  type: 'parseWorkspace';
  id: string;
  files: { name: string; content: string }[];
}

export type WorkerRequest = ParseRequest | ParseWorkspaceRequest;

export interface ParseResponse {
  type: 'parseResult';
  id: string;
  model: unknown;
  errors: string[];
}

export interface ParseWorkspaceResponse {
  type: 'parseWorkspaceResult';
  id: string;
  models: unknown[];
  errors: Record<string, string[]>;
}

export type WorkerResponse = ParseResponse | ParseWorkspaceResponse;

// ---------------------------------------------------------------------------
// Worker message handler
// ---------------------------------------------------------------------------

async function handleParse(req: ParseRequest): Promise<ParseResponse> {
  try {
    const result = await parse(req.content);
    const errors: string[] = [];
    if (result.parserErrors?.length) {
      for (const err of result.parserErrors) {
        errors.push(err.message);
      }
    }
    return { type: 'parseResult', id: req.id, model: result.value, errors };
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
  const models: unknown[] = [];
  const errors: Record<string, string[]> = {};

  for (const file of req.files) {
    try {
      const result = await parse(file.content);
      if (result.value) models.push(result.value);
      if (result.parserErrors?.length) {
        errors[file.name] = result.parserErrors.map((e) => e.message);
      }
    } catch (e) {
      errors[file.name] = [(e as Error).message];
    }
  }

  return { type: 'parseWorkspaceResult', id: req.id, models, errors };
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
