// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Cloudflare Pages Function: POST /api/parse — fix(019) lazy langium import
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

// Langium services are imported LAZILY inside parseUserFiles below so a
// curated-only request (files: [], curatedBundles: [...]) avoids the
// ~1.8 MB langium runtime import + createRuneDslServices initialization
// entirely. The curated path consumes a pre-parsed JSON artifact and
// does not need any langium pipeline at runtime.
import type { RosettaModel } from '@rune-langium/core';
import { URI } from 'langium';
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

  if (!Array.isArray(body.files)) {
    return badRequest('files: must be an array');
  }

  // Empty workspace is a legitimate state (new tab, no user files yet, or
  // user just opened the studio without loading anything). Return an empty
  // hydrationState rather than 400 — clients shouldn't have to special-case
  // this around their normal parse flow. The studio's parseWorkspaceFiles
  // calls /api/parse on every debounced edit, including before any user
  // file exists.
  if (body.files.length === 0 && (!Array.isArray(body.curatedBundles) || body.curatedBundles.length === 0)) {
    return new Response(
      JSON.stringify({
        ok: true,
        models: [],
        deferredExports: [],
        errors: {},
        hydrationState: { documents: [] }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
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

    // Only spin up Langium services when there are user files to parse.
    // Curated-only requests (files: [], curatedBundles: [...]) skip the
    // ~1.8 MB langium import + createRuneDslServices entirely — the
    // curated path consumes pre-parsed JSON via curated-fetch.ts.
    if (body.files.length > 0) {
      await parseUserFiles(body.files, errors, documentsForHydration, deferredExportsByNamespace);
    }

    // Fetch curated bundles server-to-server and merge into hydration state.
    if (Array.isArray(body.curatedBundles) && body.curatedBundles.length > 0) {
      for (const bundle of body.curatedBundles) {
        try {
          const curatedDocs = await fetchCuratedBundle(bundle.id, bundle.version);
          for (const doc of curatedDocs) {
            documentsForHydration.push(doc);
            // Surface curated namespaces in the deferredExports response so
            // the studio's namespace explorer / graph view (which reads from
            // deferredExports) lists CDM/FpML/rune-dsl entries alongside
            // user-file namespaces (Codex P2 review). Without this the corpus
            // hydrates correctly but its read-only nodes are invisible until
            // an editor link triggers linkDocument and pulls them on-demand.
            mergeCuratedDocIntoDeferredExports(doc, deferredExportsByNamespace);
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
      stringifyWithBigInt({
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

/**
 * Parse user-authored .rune files through Langium. Lazy-imports the
 * @rune-langium/core module so curated-only requests don't pay the
 * ~1.8 MB bundle init + service registration cost.
 *
 * Mutates the passed-in `errors`, `documentsForHydration`, and
 * `deferredExportsByNamespace` collections rather than returning them.
 */
async function parseUserFiles(
  files: ReadonlyArray<{ name: string; content: string }>,
  errors: Record<string, string[]>,
  documentsForHydration: Array<{
    uri: string;
    content: string;
    serializedModel: string;
    exports: Array<{ type: string; name: string; path: string }>;
  }>,
  deferredExportsByNamespace: Record<string, { filePath: string; entries: Array<{ type: string; name: string }> }>
): Promise<void> {
  const [{ createRuneDslServices }, { EmptyFileSystem }] = await Promise.all([
    import('@rune-langium/core'),
    import('langium')
  ]);
  const { RuneDsl } = createRuneDslServices(EmptyFileSystem);
  const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
  const builder = RuneDsl.shared.workspace.DocumentBuilder;

  const docs = files.map((f) => factory.fromString(f.content, toRosettaUri(f.name)));
  await builder.build(docs, { validation: false });

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const filePath = files[i].name;
    const parseErrors = doc.parseResult.parserErrors.map((e) => e.message);
    if (parseErrors.length > 0) {
      errors[filePath] = parseErrors;
    }
    const model = doc.parseResult.value as RosettaModel | undefined;
    if (!model) continue;

    // Copy CST source text into `$cstText` on Function/Data/Choice
    // condition + expression nodes BEFORE serializing. The visual editor
    // reads `$cstText` to render expression cells (functions with
    // conditions, function bodies, function expressions). Without this
    // pre-serialization step, the deserialized AST has no source text
    // — langium's `$cstNode` lives only on the live AST, not in the
    // serialized JSON — and the visual editor renders affected
    // expressions as blank even though the parse succeeded (Codex P2).
    //
    // Mirrors apps/studio/src/workers/parser-worker.ts:preserveCstText,
    // which the browser-side parse path already calls. Adding it here
    // keeps the routed parse output equivalent to the in-worker output.
    preserveCstText(model);

    // textRegions + refText preserve text-region offsets so language-
    // server features (e.g. go-to-definition, hover, code-action ranges)
    // can map AST nodes back to source spans after deserialization.
    // The BigInt replacer keeps large numeric literals JSON-safe — the
    // outer stringifyWithBigInt also handles them, but doing it inside
    // the langium serializer is more efficient (avoids one re-scan of
    // the embedded model JSON).
    const serializedModel = RuneDsl.serializer.JsonSerializer.serialize(model, {
      refText: true,
      textRegions: true,
      replacer: (_key, value, defaultReplacer) =>
        typeof value === 'bigint' ? Number(value) : defaultReplacer(_key, value)
    });
    const rawName = model.name as string;
    const namespace = rawName ? rawName.replace(/^"|"$/g, '') : '';

    const exports: Array<{ type: string; name: string; path: string }> = [];
    if (namespace) {
      for (const elem of model.elements) {
        const e = elem as { $type: string; name?: string };
        if (e.name) {
          exports.push({ type: e.$type, name: e.name, path: `${namespace}.${e.name}` });
        }
      }
    }

    documentsForHydration.push({
      uri: filePath,
      content: files[i].content,
      serializedModel,
      exports
    });

    if (namespace) {
      const existing = deferredExportsByNamespace[namespace] ?? { filePath, entries: [] };
      for (const e of exports) existing.entries.push({ type: e.type, name: e.name });
      deferredExportsByNamespace[namespace] = existing;
    }
  }
}

/**
 * Walk the parsed RosettaModel and copy `$cstNode.text` into a sibling
 * `$cstText` property on Function-body parts, condition nodes, and
 * expression nodes. Mirrors `preserveCstText` in
 * apps/studio/src/workers/parser-worker.ts — keep the two implementations
 * in sync.
 *
 * Why this is needed: the visual editor's expression cells render from
 * `$cstText` (a serializable string property) rather than `$cstNode`
 * (the live CST tree, which is non-serializable and lost during JSON
 * round-trip). The in-browser parse path attached `$cstText` before
 * postMessage; the server-side parse path needs the same step so its
 * downstream hydration payload contains the same source text.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function preserveCstText(model: any): void {
  for (const elem of model?.elements ?? []) {
    if (elem.$type === 'RosettaFunction') {
      for (const arr of [elem.shortcuts, elem.conditions, elem.operations, elem.postConditions]) {
        for (const part of arr ?? []) {
          if (part?.$cstNode?.text) {
            part.$cstText = part.$cstNode.text;
          }
          if (part?.expression?.$cstNode?.text) {
            part.expression.$cstText = part.expression.$cstNode.text;
          }
        }
      }
    }
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

/**
 * Extract the curated doc's namespace from its serialized model and merge
 * its exports into the per-namespace deferredExports map. Mutates the
 * passed map in place to match the same shape user-file parses produce.
 *
 * Namespace comes from the top-level `name` field of the Langium-serialized
 * RosettaModel. We slice off the model preamble and run a small regex
 * rather than JSON.parse the whole body — the model bodies are large
 * (~kilobytes each) but `name` always appears within the first ~256 bytes.
 */
function mergeCuratedDocIntoDeferredExports(
  doc: { uri: string; serializedModel: string; exports: Array<{ type: string; name: string; path: string }> },
  deferredExportsByNamespace: Record<string, { filePath: string; entries: Array<{ type: string; name: string }> }>
): void {
  const preamble = doc.serializedModel.slice(0, 256);
  const nameMatch = /"name"\s*:\s*"([^"]+)"/.exec(preamble);
  if (!nameMatch) return;
  const namespace = nameMatch[1].replace(/^"|"$/g, '');
  if (!namespace) return;

  const existing = deferredExportsByNamespace[namespace] ?? { filePath: doc.uri, entries: [] };
  for (const e of doc.exports) existing.entries.push({ type: e.type, name: e.name });
  deferredExportsByNamespace[namespace] = existing;
}

/**
 * `JSON.stringify` throws on BigInt by default. The Langium parser produces
 * BigInt values for some numeric literals in the Rune grammar (e.g. very
 * large integers parsed as bigint). Those leak into `documentsForHydration`
 * via `serializedModel` and `exports`, so we need a replacer that converts
 * them to strings. Browser-side deserialization treats them as strings —
 * acceptable because nothing on the client currently depends on numeric
 * comparison of these values.
 */
function stringifyWithBigInt(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v));
}
