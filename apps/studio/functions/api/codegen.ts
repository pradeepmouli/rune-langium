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

interface CodegenRequestBody {
  files: Array<{ path: string; content: string }>;
  target: Target;
  options?: {
    sql?: {
      dialect?: 'postgres' | 'sqlserver';
      inheritance?: 'single-table' | 'table-per-type';
      enumStrategy?: 'check' | 'table';
    };
  };
}

// No env bindings used yet — kept as a typed shape so future
// rate-limiting / curated-bundle hydration can plug in cleanly.
interface Env {}

function jsonError(status: number, error: string, diagnostics: readonly GeneratorDiagnostic[] = []): Response {
  return new Response(JSON.stringify({ ok: false, error, diagnostics }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function isValidRequest(body: unknown): body is CodegenRequestBody {
  if (!body || typeof body !== 'object') return false;
  const b = body as { files?: unknown; target?: unknown };
  return (
    Array.isArray(b.files) &&
    b.files.every(
      (f) =>
        f &&
        typeof f === 'object' &&
        typeof (f as { path?: unknown }).path === 'string' &&
        typeof (f as { content?: unknown }).content === 'string'
    ) &&
    typeof b.target === 'string'
  );
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

async function parseDocuments(
  files: ReadonlyArray<{ path: string; content: string }>
): Promise<import('langium').LangiumDocument[]> {
  const [{ createRuneDslServices }, { EmptyFileSystem, URI }] = await Promise.all([
    import('@rune-langium/core'),
    import('langium')
  ]);
  const { RuneDsl } = createRuneDslServices(EmptyFileSystem);
  const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
  const builder = RuneDsl.shared.workspace.DocumentBuilder;

  const docs = files.map((f) => factory.fromString(f.content, toRosettaUri(f.path, URI)));
  await builder.build(docs, { validation: false });
  return docs;
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

export const onRequestPost: PagesFunction<Env> = async ({ request }) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError(400, 'Malformed JSON body');
  }
  if (!isValidRequest(raw)) {
    return jsonError(400, 'Request must be { files: [{path, content}], target: <Target>, options? }');
  }
  const body = raw;

  // Target gating. `IMPLEMENTED_TARGETS` is the single source of truth
  // for which emitters this build has; mirrors the studio table's
  // filter so the server doesn't accept a click the UI would never
  // have sent.
  if (!(IMPLEMENTED_TARGETS as readonly string[]).includes(body.target)) {
    return jsonError(400, `Target '${body.target}' is not implemented in this build`);
  }

  if (body.files.length === 0) {
    return jsonError(400, 'files: must be a non-empty array');
  }

  try {
    const documents = await parseDocuments(body.files);
    const parseErrors = hasParserErrors(documents);
    if (parseErrors.length > 0) {
      return jsonError(400, 'One or more files failed to parse', parseErrors);
    }

    // Lazy-import `generate` so the function cold-start doesn't pay for
    // the codegen bundle on requests that fail at the parse step.
    //
    // Thread `body.options` through to the generator (Copilot review
    // on PR #165). Phase 0 has no target-specific options yet, but
    // Phase 2+ SQL emitter will use `options.sql.dialect` etc., and
    // the contract is dead-on-arrival without this hookup.
    const { generate } = await import('@rune-langium/codegen');
    const outputs = await generate(documents, { target: body.target, ...body.options });

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
