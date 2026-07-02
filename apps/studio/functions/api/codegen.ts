// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Cloudflare Pages Function: POST /api/codegen — 018 Phase 0 Tasks 0.10/0.11.
 *
 * Server-side codegen for the studio's Download flow. The studio POSTs
 * `{ files, target, options }`; this function lazy-imports
 * `@rune-langium/core` (Langium services) and `@rune-langium/codegen`,
 * runs the emitter, and returns either:
 *
 *   - 200 with a single text/binary file when the emitter produced one
 *     output (or for whole-model emitters by definition);
 *   - 200 with a `<target>-output.zip` when multiple per-namespace
 *     outputs need to be bundled;
 *   - 400 with a JSON `{ ok: false, diagnostics, error }` envelope when
 *     the request shape is invalid OR generation produced fatal
 *     diagnostics OR the target has no registered emitter.
 *
 * Mirrors the lazy-import + URI-remap pattern from `/api/parse` so a
 * curated-only build doesn't pay for Langium until generation actually
 * runs.
 *
 * Spec: docs/superpowers/specs/2026-05-12-codegen-additional-targets-design.md §7.6
 */

import JSZip from 'jszip';
import {
  IMPLEMENTED_TARGETS,
  TARGET_DESCRIPTORS,
  type GeneratorDiagnostic,
  type GeneratorOutput,
  type Target
} from '@rune-langium/codegen';
import { fetchCuratedManifest, fetchCuratedNamespace, CuratedBundleUnavailableError } from '../lib/curated-fetch.js';
import { closeNamespacesFromManifest } from '../lib/curated-closure.js';

interface CodegenRequestBody {
  files: Array<{ path: string; content: string }>;
  target: Target;
  /**
   * Per-target option blocks. Mirrors `GeneratorOptions` from
   * @rune-langium/codegen — `options.<target>.layout` selects per-
   * namespace vs whole-model emission per spec §3.1. When the layout
   * is omitted, this function injects the opinionated Pages-Function
   * default for the target (019 spec §10.1) — barrel for Zod/TS,
   * single-file for JSON Schema.
   */
  options?: {
    zod?: { layout?: 'per-namespace' | 'barrel' | 'single-file' };
    typescript?: { layout?: 'per-namespace' | 'barrel' | 'single-file' };
    'json-schema'?: { layout?: 'per-namespace' | 'single-file' };
    sql?: {
      dialect?: 'postgres' | 'sqlserver';
      inheritance?: 'single-table' | 'table-per-type';
      enumStrategy?: 'check' | 'table';
      layout?: 'per-namespace' | 'single-file';
    };
    markdown?: { layout?: 'per-namespace' | 'barrel' };
  };
  /**
   * Optional curated-bundle hydration list. When present, the function
   * fetches each bundle's pre-parsed serialized AST via the
   * `CURATED_MIRROR` service binding (same pattern as /api/parse) and
   * passes the deserialized documents alongside user files to
   * `generate()`. Enables curated-only workspaces (CDM, FpML, rune-dsl)
   * to be served by Download.
   *
   * 019 Task #88.
   */
  curatedBundles?: Array<{ id: string; version: string }>;
  /**
   * Pre-loaded serialized curated docs (path A). When present, the server
   * deserializes these directly and performs NO manifest/namespace fetch —
   * the studio passes the closure it already loaded via /api/parse. Mutually
   * exclusive with curatedBundles; if both are sent, curatedDocs wins.
   */
  curatedDocs?: Array<{ uri: string; serializedModel: string }>;
  /**
   * Optional namespace allowlist (019 spec §5.1/§5.3). The Download config
   * modal sends the dependency-closed subset (selected ∪ transitively
   * pulled). Passed straight through to `generate()` as `options.namespaces`.
   * Absent for legacy/direct callers → all namespaces emitted.
   */
  namespaces?: string[];
}

/**
 * Per-target opinionated layout default applied by `/api/codegen` when
 * the request omits `options.<target>.layout`. 019 spec §10.1: the
 * library default stays `'per-namespace'` so CLI users see no change;
 * the Pages Function flips to the bundled shape so the studio's
 * Download button delivers a drop-in artifact.
 */
const PAGES_FUNCTION_DEFAULT_LAYOUT: Partial<Record<Target, string>> = {
  zod: 'barrel',
  typescript: 'barrel',
  'json-schema': 'single-file',
  sql: 'single-file',
  markdown: 'barrel'
};

// 019 Task #88 — curated bundles ride through the `CURATED_MIRROR`
// service binding (same wiring as /api/parse, declared in wrangler.toml).
// Local dev and tests can omit the binding; the function falls back to
// global fetch against the public curated-mirror URL.
interface Env {
  CURATED_MIRROR?: {
    fetch: (input: string | Request, init?: RequestInit) => Promise<Response>;
  };
}

function jsonError(status: number, error: string, diagnostics: readonly GeneratorDiagnostic[] = []): Response {
  return new Response(JSON.stringify({ ok: false, error, diagnostics }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function isValidRequest(body: unknown): body is CodegenRequestBody {
  if (!body || typeof body !== 'object') return false;
  const b = body as { files?: unknown; target?: unknown; curatedBundles?: unknown; curatedDocs?: unknown };
  if (
    !Array.isArray(b.files) ||
    !b.files.every(
      (f) =>
        f &&
        typeof f === 'object' &&
        typeof (f as { path?: unknown }).path === 'string' &&
        typeof (f as { content?: unknown }).content === 'string'
    ) ||
    typeof b.target !== 'string'
  ) {
    return false;
  }
  // Copilot review on PR #168 — when `curatedBundles` is supplied, it
  // must be an array of `{ id: string, version: string }`. A malformed
  // value used to produce an opaque 500 at the fetch site;
  // now it's a 400 with the validator's documented shape message.
  if (b.curatedBundles !== undefined) {
    if (
      !Array.isArray(b.curatedBundles) ||
      !b.curatedBundles.every(
        (entry) =>
          entry &&
          typeof entry === 'object' &&
          typeof (entry as { id?: unknown }).id === 'string' &&
          typeof (entry as { version?: unknown }).version === 'string'
      )
    ) {
      return false;
    }
  }
  // Path A — when `curatedDocs` is supplied, each entry must be
  // `{ uri: string, serializedModel: string }`. A non-array or
  // structurally invalid entry is rejected with a 400.
  if (b.curatedDocs !== undefined) {
    if (
      !Array.isArray(b.curatedDocs) ||
      !b.curatedDocs.every(
        (d) =>
          d &&
          typeof d === 'object' &&
          typeof (d as { uri?: unknown }).uri === 'string' &&
          typeof (d as { serializedModel?: unknown }).serializedModel === 'string'
      )
    ) {
      return false;
    }
  }
  // 019 §5.3 — `namespaces`, when present, must be an array of strings.
  const ns = (body as { namespaces?: unknown }).namespaces;
  if (ns !== undefined) {
    if (!Array.isArray(ns) || !ns.every((n) => typeof n === 'string')) {
      return false;
    }
  }
  return true;
}

/**
 * Remap a `.rune`-style file name to a `.rosetta` URI so the Langium
 * service registry (which only registers the `.rosetta` parser) can
 * dispatch correctly. Internal to the server-side parse only — the
 * generated outputs use the namespace-derived path from
 * `getTargetRelativePath`, not the input file names.
 */
function toRosettaUri(name: string, URI: typeof import('langium').URI): import('langium').URI {
  const remapped = name.replace(/\.[^./\\]+$/, '.rosetta');
  return URI.parse(`file:///${remapped}`);
}

/**
 * Combined loader for user-authored files + curated-bundle documents.
 * Hydrates both into a single `LangiumDocument[]` that `generate()`
 * can consume.
 *
 * User files take the parse path (raw .rune source → Langium parser →
 * resolved AST). Curated bundles take the deserialize path: each
 * pre-parsed `modelJson` is rebuilt into a Langium AST via
 * `JsonSerializer.deserialize`, then wrapped in a synthetic
 * `LangiumDocument` so it shares the same shape as the parsed
 * user-file documents.
 *
 * The codegen package only reads `doc.uri` and `doc.parseResult.value`
 * from each document — both fields are populated by the path above,
 * so the emitters don't need to know which path produced each doc.
 *
 * 019 Task #88.
 */
async function loadAllDocuments(
  files: ReadonlyArray<{ path: string; content: string }>,
  curatedBundles: ReadonlyArray<{ id: string; version: string }>,
  curatedFetcher: ((url: string, init?: RequestInit) => Promise<Response>) | undefined,
  requestedNamespaces: readonly string[],
  curatedDocs: ReadonlyArray<{ uri: string; serializedModel: string }>
): Promise<{ docs: import('langium').LangiumDocument[]; curatedError?: Response }> {
  const [{ createRuneDslServices, hydrateModelDocument }, { EmptyFileSystem, URI }] = await Promise.all([
    import('@rune-langium/core'),
    import('langium')
  ]);
  const { RuneDsl } = createRuneDslServices(EmptyFileSystem);
  const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
  const builder = RuneDsl.shared.workspace.DocumentBuilder;

  const docs: import('langium').LangiumDocument[] = [];

  // User-authored files — parse via Langium.
  if (files.length > 0) {
    const parsed = files.map((f) => factory.fromString(f.content, toRosettaUri(f.path, URI)));
    docs.push(...parsed);
  }

  // Closure seeds: namespaces the user files import, plus the request's
  // dependency-closed namespace subset (the modal cascade output). Imports are
  // syntactic — readable from the parsed AST without a link.
  const seeds = new Set<string>(requestedNamespaces);
  for (const doc of docs) {
    const model = doc.parseResult?.value as { imports?: Array<{ importedNamespace?: unknown }> } | undefined;
    for (const imp of model?.imports ?? []) {
      if (typeof imp.importedNamespace === 'string' && imp.importedNamespace.length > 0) {
        seeds.add(imp.importedNamespace);
      }
    }
  }

  // Path A — client pre-loaded the curated docs via /api/parse and sends them
  // in the request. Deserialize each entry directly; skip all manifest/
  // namespace fetching entirely. curatedDocs wins when both are present.
  if (curatedDocs.length > 0) {
    for (const cd of curatedDocs) {
      const { document } = hydrateModelDocument(
        { RuneDsl, shared: RuneDsl.shared },
        URI.parse(`curated:///${cd.uri}`),
        cd.serializedModel,
        { register: 'idempotent' }
      );
      docs.push(document);
    }
  } else {
    // Path C — fetch only the import closure via the manifest. This avoids
    // loading the whole serialized workspace artifact (which OOMs on CDM at
    // 128 MiB). The manifest records the dependency graph so we walk it here
    // without fetching+parsing any documents upfront.
    for (const bundle of curatedBundles) {
      try {
        const manifest = await fetchCuratedManifest(bundle.id, bundle.version, curatedFetcher);
        if (!manifest?.namespaces || Object.keys(manifest.namespaces).length === 0) {
          return {
            docs: [],
            curatedError: new Response(
              JSON.stringify({
                ok: false,
                error: 'curated_manifest_missing',
                bundleId: bundle.id,
                version: bundle.version
              }),
              { status: 502, headers: { 'Content-Type': 'application/json' } }
            )
          };
        }
        const nsGraph = manifest.namespaces;
        // Empty seeds (no request `namespaces` and no user imports) preserves the
        // "no filter → emit everything" contract: load every namespace in the
        // bundle. A scoped request (the studio's normal flow always sends the
        // dependency-closed `namespaces`) loads only its transitive closure.
        const closure = seeds.size > 0 ? closeNamespacesFromManifest(seeds, nsGraph) : new Set(Object.keys(nsGraph));
        const closureNs = [...closure].filter((ns) => nsGraph[ns]);
        const FETCH_CONCURRENCY = 8;
        for (let i = 0; i < closureNs.length; i += FETCH_CONCURRENCY) {
          const window = closureNs.slice(i, i + FETCH_CONCURRENCY);
          const fetched = await Promise.all(
            window.map((ns) => fetchCuratedNamespace(bundle.id, bundle.version, nsGraph[ns]!.artifact, curatedFetcher))
          );
          for (const nsDocs of fetched) {
            for (const cd of nsDocs) {
              const { document } = hydrateModelDocument(
                { RuneDsl, shared: RuneDsl.shared },
                URI.parse(`curated:///${cd.uri}`),
                cd.serializedModel,
                { register: 'idempotent' }
              );
              docs.push(document);
            }
          }
        }
      } catch (err) {
        if (err instanceof CuratedBundleUnavailableError) {
          return {
            docs: [],
            curatedError: new Response(
              JSON.stringify({
                ok: false,
                error: 'curated_bundle_unavailable',
                bundleId: err.bundleId,
                version: err.version,
                upstreamStatus: err.status
              }),
              { status: 502, headers: { 'Content-Type': 'application/json' } }
            )
          };
        }
        throw err;
      }
    }
  }

  // Build only the user-file docs; the curated docs are pre-built and
  // their cross-references resolved at serialization time on the mirror.
  // Builder.build on a deserialized doc would try to re-link references
  // and fail since the Langium service hasn't indexed them.
  if (files.length > 0) {
    const userDocs = docs.slice(0, files.length);
    await builder.build(userDocs, { validation: false });
  }

  return { docs };
}

function hasParserErrors(docs: ReadonlyArray<import('langium').LangiumDocument>): GeneratorDiagnostic[] {
  // Use the shape from packages/codegen/src/diagnostics.ts so the
  // response envelope is uniform with codegen-emitted diagnostics.
  const diagnostics: GeneratorDiagnostic[] = [];
  for (const doc of docs) {
    for (const err of doc.parseResult.parserErrors) {
      diagnostics.push({
        severity: 'error',
        code: 'parse-error',
        message: err.message
      });
    }
  }
  return diagnostics;
}

function fatalDiagnostics(outputs: readonly GeneratorOutput[]): GeneratorDiagnostic[] {
  return outputs.flatMap((o) => o.diagnostics.filter((d) => d.severity === 'error'));
}

function downloadFilename(target: Target, outputs: readonly GeneratorOutput[]): string {
  const descriptor = TARGET_DESCRIPTORS[target];
  // Multi-file results are always returned as a zip via `zipResponse`,
  // regardless of contract. Codex review on PR #165 caught that a
  // whole-model emitter returning workbook + sidecar manifest would
  // previously have been served the zip's bytes under the `model.xlsx`
  // filename — i.e., the browser would save a zip body as if it were
  // a workbook. Length check takes precedence so the filename stays
  // truthful to the body.
  if (outputs.length > 1) {
    return `${target}-output.zip`;
  }
  // Single-output path. Whole-model emitters embed the bundled path
  // (`model.xlsx`, `schema.graphql`) in `relativePath`; per-namespace
  // emitters embed `<ns>/<base><ext>`.
  if (descriptor.contract === 'whole-model') {
    return outputs[0]?.relativePath ?? `model${descriptor.extension}`;
  }
  return outputs[0]!.relativePath.split('/').pop() ?? `${target}-output${descriptor.extension}`;
}

function singleArtifactResponse(target: Target, output: GeneratorOutput, filename: string): Response {
  const descriptor = TARGET_DESCRIPTORS[target];
  const contentType = descriptor.mimeType ?? 'text/plain; charset=utf-8';
  // Whole-model binary emitters set `output.binary` (Uint8Array); text
  // emitters set `output.content` (string). Phase 0 only ships text
  // emitters but the contract supports both. The cast through ArrayBuffer
  // is for the CF Workers `BodyInit` type, which doesn't accept typed
  // array views directly the way the DOM lib does.
  const body: BodyInit = output.binary
    ? (output.binary.buffer.slice(
        output.binary.byteOffset,
        output.binary.byteOffset + output.binary.byteLength
      ) as ArrayBuffer)
    : output.content;
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
}

async function zipResponse(outputs: readonly GeneratorOutput[], filename: string): Promise<Response> {
  const zip = new JSZip();
  for (const output of outputs) {
    if (output.binary !== undefined) {
      zip.file(output.relativePath, output.binary);
    } else {
      zip.file(output.relativePath, output.content);
    }
  }
  // Generate the zip as a Node-buffer / ArrayBuffer so the CF Workers
  // `BodyInit` accepts it directly (Uint8Array isn't on the union).
  const body = await zip.generateAsync({ type: 'arraybuffer' });
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
}

/**
 * Build the `GeneratorOptions` to pass to `generate()`, filling in the
 * Pages-Function-opinionated layout default for the target when the
 * request omits one. The library default stays `'per-namespace'` so a
 * direct caller (CLI / test fixture) that passes
 * `options.<target>.layout: 'per-namespace'` keeps that choice — we
 * only fill in when nothing was set.
 */
function applyPagesFunctionDefaults(body: CodegenRequestBody): Record<string, unknown> {
  const result: Record<string, unknown> = { target: body.target, ...body.options };
  // 019 §5.3 — forward the namespace allowlist to generate(). Empty array
  // is treated as "no filter" (omit) so an accidental empty selection
  // doesn't silently emit nothing; the modal disables Generate on an empty
  // set, and direct callers that want everything just omit the field.
  if (Array.isArray(body.namespaces) && body.namespaces.length > 0) {
    result.namespaces = body.namespaces;
  }
  const target = body.target;
  const serverDefault = PAGES_FUNCTION_DEFAULT_LAYOUT[target];
  if (!serverDefault) return result;
  const existingBlock = (result[target] as { layout?: string } | undefined) ?? {};
  if (existingBlock.layout) return result; // caller explicitly set it
  result[target] = { ...existingBlock, layout: serverDefault };
  return result;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError(400, 'Malformed JSON body');
  }
  if (!isValidRequest(raw)) {
    return jsonError(400, 'Request must be { files: [{path, content}], target: <Target>, options?, curatedBundles? }');
  }
  const body = raw;

  // Target gating. `IMPLEMENTED_TARGETS` is the single source of truth
  // for which emitters this build has; mirrors the studio table's
  // filter so the server doesn't accept a click the UI would never
  // have sent.
  if (!(IMPLEMENTED_TARGETS as readonly string[]).includes(body.target)) {
    return jsonError(400, `Target '${body.target}' is not implemented in this build`);
  }

  const curatedBundles = body.curatedBundles ?? [];
  const curatedDocs = body.curatedDocs ?? [];
  // 019 Task #88 — a pure curated workspace ships zero user files but a
  // non-empty curated source: either curatedBundles (path C) OR pre-loaded
  // curatedDocs (path A). All three empty is the genuine bad-input case.
  if (body.files.length === 0 && curatedBundles.length === 0 && curatedDocs.length === 0) {
    return jsonError(400, 'files / curatedBundles / curatedDocs: at least one must be non-empty');
  }

  try {
    const curatedFetcher = env?.CURATED_MIRROR
      ? (url: string, init?: RequestInit) => env.CURATED_MIRROR!.fetch(url, init)
      : undefined;
    const { docs: documents, curatedError } = await loadAllDocuments(
      body.files,
      curatedBundles,
      curatedFetcher,
      body.namespaces ?? [],
      curatedDocs
    );
    if (curatedError) return curatedError;

    const parseErrors = hasParserErrors(documents);
    if (parseErrors.length > 0) {
      return jsonError(400, 'One or more files failed to parse', parseErrors);
    }

    // Lazy-import `generate` so the function cold-start doesn't pay
    // for the codegen bundle on requests that fail at the parse step.
    //
    // Apply the Pages Function's opinionated layout default for the
    // target (019 Phase 0.5.5) — the studio's Download flow delegates
    // its layout choice to the server, so `body.options.<target>.layout`
    // is only set when a caller wants to override the server's choice.
    const { generate } = await import('@rune-langium/codegen');
    const generatorOptions = applyPagesFunctionDefaults(body);
    const outputs = await generate(documents, generatorOptions);

    const errors = fatalDiagnostics(outputs);
    if (errors.length > 0) {
      return jsonError(400, 'Code generation produced errors', errors);
    }
    if (outputs.length === 0) {
      return jsonError(400, 'No output was generated (workspace had no namespaces)');
    }

    const filename = downloadFilename(body.target, outputs);
    if (outputs.length === 1) {
      return singleArtifactResponse(body.target, outputs[0]!, filename);
    }
    return zipResponse(outputs, filename);
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        diagnostics: []
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
