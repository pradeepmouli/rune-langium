// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Parser Web Worker — offloads Rune DSL parsing to a background thread (T097).
 *
 * Accepts messages with { type: 'parse', content: string } or
 * { type: 'parseWorkspace', files: { name: string; content: string }[] }
 * and returns parsed results.
 */

import { parse, parseWorkspace } from '@rune-langium/core';

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
    const result = await parse(req.content, req.uri);
    const errors: string[] = [];
    if (result.parserErrors?.length) {
      for (const err of result.parserErrors) {
        errors.push(err.message);
      }
    }
    if (result.value) preserveCstText(result.value);
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
  const errors: Record<string, string[]> = {};
  if (req.files.length === 0) {
    return { type: 'parseWorkspaceResult', id: req.id, models: [], errors };
  }

  const results = await parseWorkspace(
    req.files.map((file) => ({
      uri: file.name,
      content: file.content
    }))
  );
  const models: unknown[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const file = req.files[i]!;
    if (result.value) {
      preserveCstText(result.value);
      models.push(result.value);
    }
    if (result.parserErrors.length > 0) {
      errors[file.name] = result.parserErrors.map((e) => e.message);
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
