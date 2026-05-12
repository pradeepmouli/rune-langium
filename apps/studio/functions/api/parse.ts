// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Cloudflare Pages Function: POST /api/parse
 *
 * Server-side `parseWorkspace`. Browser studio POSTs workspace files;
 * function runs Langium parse + builds the index, returns a hydration
 * blob the browser worker can replay locally so subsequent linkDocument
 * requests work without re-parsing.
 *
 * The Langium grammar is registered for `.rosetta` extension only.
 * Incoming files may use `.rune` (studio convention) — we remap URIs
 * internally to `.rosetta` so the service registry can resolve the parser,
 * then expose the original file name in the response.
 */

import { createRuneDslServices } from '@rune-langium/core';
import type { RosettaModel } from '@rune-langium/core';
import { EmptyFileSystem, URI, type LangiumDocument, type AstNode } from 'langium';

type ParseRequestBody = {
  files: Array<{ name: string; content: string }>;
};

function badRequest(error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Remap a file name to a `.rosetta` URI so the Langium service registry
 * (which only knows about `.rosetta`) can find the correct parser.
 * We keep the original name for all external-facing fields.
 */
function toRosettaUri(name: string): URI {
  // Replace trailing extension (e.g. `.rune`) with `.rosetta`, or append it.
  const remapped = name.replace(/\.[^./\\]+$/, '.rosetta');
  return URI.parse(`file:///${remapped}`);
}

export const onRequestPost: PagesFunction = async ({ request }) => {
  let body: ParseRequestBody;
  try {
    body = (await request.json()) as ParseRequestBody;
  } catch {
    return badRequest('Malformed JSON');
  }

  if (!Array.isArray(body.files) || body.files.length === 0) {
    return badRequest('files: must be a non-empty array');
  }

  const { RuneDsl } = createRuneDslServices(EmptyFileSystem);
  const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
  const builder = RuneDsl.shared.workspace.DocumentBuilder;

  const docs: LangiumDocument<AstNode>[] = body.files.map((f) => factory.fromString(f.content, toRosettaUri(f.name)));
  await builder.build(docs, { validation: false });

  // parsedModels accumulates file-path summaries (no raw AST — Langium nodes
  // have circular $container refs and cannot be JSON-serialized directly).
  const parsedModels: Array<{ filePath: string }> = [];
  const errors: Record<string, string[]> = {};
  const documentsForHydration: Array<{
    uri: string;
    content: string;
    serializedModel: string;
    exports: Array<{ type: string; name: string; path: string }>;
  }> = [];

  // The legacy deferredExports summary mirrors what handleParseWorkspace produces.
  const deferredExportsByNamespace: Record<string, Array<{ type: string; name: string }>> = {};

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const filePath = body.files[i].name;
    const parseErrors = doc.parseResult.parserErrors.map((e) => e.message);
    if (parseErrors.length > 0) {
      errors[filePath] = parseErrors;
    }
    const model = doc.parseResult.value as RosettaModel | undefined;
    if (!model) continue;
    parsedModels.push({ filePath });

    // Serialize the model for hydration (Langium JSON serializer).
    const serializedModel = RuneDsl.serializer.JsonSerializer.serialize(model);

    // RosettaModel.name is QualifiedName (= string). Strip surrounding quotes
    // that the Langium grammar/parser may add for string literals.
    const rawName = model.name as string;
    const namespace = rawName ? rawName.replace(/^"|"$/g, '') : '';

    // Iterate model.elements — the typed union Array<RosettaRootElement>.
    // Each element has a $type and most have a name (ValidID = string).
    const exports: Array<{ type: string; name: string; path: string }> = [];
    if (namespace) {
      for (const elem of model.elements) {
        const elemWithName = elem as { $type: string; name?: string };
        if (elemWithName.name) {
          exports.push({
            type: elemWithName.$type,
            name: elemWithName.name,
            path: `${namespace}.${elemWithName.name}`
          });
        }
      }
    }

    // The hydration URI must match what the browser worker will use to look up
    // documents. Use the original (possibly `.rune`) name as the URI path so
    // callers don't have to translate extension names back.
    documentsForHydration.push({
      uri: `file:///${filePath}`,
      content: body.files[i].content,
      serializedModel,
      exports
    });

    if (namespace) {
      const existing = deferredExportsByNamespace[namespace] ?? [];
      for (const e of exports) existing.push({ type: e.type, name: e.name });
      deferredExportsByNamespace[namespace] = existing;
    }
  }

  // Raw Langium AST nodes have circular $container refs and cannot be
  // JSON-serialized. The HTTP response carries the serialized AST inside
  // `hydrationState.documents[].serializedModel` (Langium JSON serializer
  // output). `models` is sent as an empty array; `parsedModels` carries only
  // file-path summaries so callers can see which files parsed successfully.

  return new Response(
    JSON.stringify({
      ok: true,
      models: [],
      parsedModels,
      deferredExports: Object.entries(deferredExportsByNamespace).map(([namespace, nsExports]) => ({
        filePath: `${namespace.replace(/\./g, '/')}.rosetta`,
        namespace,
        exports: nsExports
      })),
      errors,
      hydrationState: { documents: documentsForHydration }
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
};
