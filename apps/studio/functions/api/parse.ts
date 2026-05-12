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
import { fetchCuratedBundle, CuratedBundleUnavailableError } from '../lib/curated-fetch.js';

type ParseRequestBody = {
  files: Array<{ name: string; content: string }>;
  curatedBundles?: Array<{ id: string; version: string }>;
};

function badRequest(error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Remap a file name to a `.rosetta` URI so the Langium service registry
 * (which only knows about `.rosetta`) can find the correct parser. This
 * URI is INTERNAL to the server-side parse — it's the document handle
 * inside the Langium services, not what we send to the browser.
 *
 * The browser worker keys `deferredModelJson` off the raw filePath
 * (`URI.parse(filePath).toString()`) because that's what
 * `linkDocument(filePath)` from EditorPage sends. The hydration payload
 * therefore emits `doc.uri = filePath` (no scheme), not a `file://` URI.
 */
function toRosettaUri(name: string): URI {
  // Replace trailing extension (e.g. `.rune`) with `.rosetta`. Files without an
  // extension keep their bare name; the Langium service registry uses the
  // remapped suffix to dispatch to the correct parser, and the bare-name case
  // is exercised by tests with paths like `inmemory:///model` that already
  // resolve to the `.rosetta` parser via Langium's default routing.
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

  try {
    const { RuneDsl } = createRuneDslServices(EmptyFileSystem);
    const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
    const builder = RuneDsl.shared.workspace.DocumentBuilder;

    const docs: LangiumDocument<AstNode>[] = body.files.map((f) => factory.fromString(f.content, toRosettaUri(f.name)));
    await builder.build(docs, { validation: false });

    const errors: Record<string, string[]> = {};
    const documentsForHydration: Array<{
      uri: string;
      content: string;
      serializedModel: string;
      exports: Array<{ type: string; name: string; path: string }>;
    }> = [];

    // The legacy deferredExports summary mirrors what handleParseWorkspace produces.
    // Carries the real file name so EditorPage's "click node → open in source"
    // lookup (files.find(f => f.path === filePath)) can match it. If multiple
    // files share a namespace the first file wins — same behaviour as the browser
    // worker's handleParseWorkspace (Map keyed by namespace).
    const deferredExportsByNamespace: Record<
      string,
      { filePath: string; entries: Array<{ type: string; name: string }> }
    > = {};

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      const filePath = body.files[i].name;
      const parseErrors = doc.parseResult.parserErrors.map((e) => e.message);
      if (parseErrors.length > 0) {
        errors[filePath] = parseErrors;
      }
      const model = doc.parseResult.value as RosettaModel | undefined;
      if (!model) continue;

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
      // documents. The worker keys `deferredModelJson` off
      // `URI.parse(filePath).toString()` (handleLinkDocument and the old
      // handleParseWorkspace both use this shape), and `linkDocument(filePath)`
      // from EditorPage sends the raw filePath. Emit the filePath verbatim so
      // both register and lookup produce the same key — adding a `file://`
      // prefix here would silently break cross-reference resolution after a
      // router-based parse.
      documentsForHydration.push({
        uri: filePath,
        content: body.files[i].content,
        serializedModel,
        exports
      });

      if (namespace) {
        const existing = deferredExportsByNamespace[namespace] ?? { filePath, entries: [] };
        for (const e of exports) existing.entries.push({ type: e.type, name: e.name });
        deferredExportsByNamespace[namespace] = existing;
      }
    }

    // Fetch curated bundles server-to-server and merge into hydration state.
    if (Array.isArray(body.curatedBundles) && body.curatedBundles.length > 0) {
      for (const bundle of body.curatedBundles) {
        try {
          const curatedDocs = await fetchCuratedBundle(bundle.id, bundle.version);
          for (const doc of curatedDocs) {
            documentsForHydration.push(doc);
          }
        } catch (err) {
          if (err instanceof CuratedBundleUnavailableError) {
            return new Response(
              JSON.stringify({
                ok: false,
                error: 'curated_bundle_unavailable',
                bundleId: err.bundleId,
                version: err.version,
                upstreamStatus: err.status
              }),
              { status: 502, headers: { 'Content-Type': 'application/json' } }
            );
          }
          throw err;
        }
      }
    }

    // Raw Langium AST nodes have circular $container refs and cannot be
    // JSON-serialized. The HTTP response carries the serialized AST inside
    // `hydrationState.documents[].serializedModel` (Langium JSON serializer
    // output). `models` is intentionally empty; `parsedModels` is omitted
    // entirely — the browser worker (Task 0.5) will reconstruct any model list
    // it needs from hydrationState.documents.

    return new Response(
      JSON.stringify({
        ok: true,
        models: [],
        // parsedModels intentionally absent — server cannot send Langium ASTs
        // (circular $container refs). Task 0.5 rebuilds this client-side from
        // hydrationState.documents if needed.
        deferredExports: Object.entries(deferredExportsByNamespace).map(
          ([namespace, { filePath: nsFilePath, entries }]) => ({
            filePath: nsFilePath,
            namespace,
            exports: entries
          })
        ),
        errors,
        hydrationState: { documents: documentsForHydration }
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
