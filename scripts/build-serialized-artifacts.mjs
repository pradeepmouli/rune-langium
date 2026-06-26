#!/usr/bin/env node
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
//
// Build serialized workspace artifacts for curated models.
//
// Runs the same Langium parse + serialize that the curated-mirror
// worker does, but in a CI environment with enough memory for CDM.
// The worker OOMs on CDM (~141 files through Langium); CI has 4GB+.
//
// Usage:
//   node --max-old-space-size=4096 scripts/build-serialized-artifacts.mjs
//
// Outputs to dist/curated-artifacts/<modelId>/ for R2 upload via wrangler.

import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import { computeNamespaceGraph, nsArtifactSlug } from './lib/namespace-graph.mjs';

const corePkgDir = new URL('../packages/core/', import.meta.url);
const langiumIndex = new URL('node_modules/langium/lib/index.js', corePkgDir);
const { URI } = await import(langiumIndex);

const SOURCES = [
  { id: 'cdm', owner: 'REGnosys', repo: 'rosetta-cdm', ref: 'master' },
  { id: 'fpml', owner: 'rosetta-models', repo: 'rune-fpml', ref: 'master' },
  { id: 'rune-dsl', owner: 'finos', repo: 'rune-dsl', ref: 'main' }
];

const LANGIUM_VERSION = '4.2.2';
const OUT_DIR = 'dist/curated-artifacts';
// Public base for absolute artifact URLs in the manifest (matches archiveUrl +
// artifacts.serializedWorkspace.url). Per-namespace `artifact` values MUST be
// absolute so any consumer can fetch them directly without prefixing — relative
// paths resolve against the consumer's page URL and 404.
const MIRROR_BASE = 'https://www.daikonic.dev/curated';

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function downloadArchive(source) {
  const url = `https://codeload.github.com/${source.owner}/${source.repo}/tar.gz/refs/heads/${source.ref}`;
  console.log(`  Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

function readTarString(block, start, end) {
  const sub = block.subarray(start, end);
  let last = sub.length;
  while (last > 0 && sub[last - 1] === 0) last--;
  return new TextDecoder('utf-8').decode(sub.subarray(0, last));
}

function isAllZero(block) {
  for (let i = 0; i < block.length; i++) {
    if (block[i] !== 0) return false;
  }
  return true;
}

function extractRosettaFiles(tarGzBytes) {
  const tar = new Uint8Array(gunzipSync(Buffer.from(tarGzBytes)));
  const decoder = new TextDecoder('utf-8');
  const files = [];
  const BLOCK = 512;
  let offset = 0;

  while (offset + BLOCK <= tar.byteLength) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (isAllZero(header)) break;

    const name = readTarString(header, 0, 100);
    const sizeOctal = readTarString(header, 124, 136).trim();
    const typeflag = readTarString(header, 156, 157) || '\0';
    const prefix = readTarString(header, 345, 500);
    const size = sizeOctal.length > 0 ? parseInt(sizeOctal, 8) : 0;
    let path = prefix.length > 0 ? `${prefix}/${name}` : name;
    if (path.startsWith('./')) path = path.slice(2);
    if (path.endsWith('/')) path = path.slice(0, -1);

    offset += BLOCK;
    const dataBlocks = Math.ceil(size / BLOCK);

    if ((typeflag === '0' || typeflag === '\0' || typeflag === '') && path.endsWith('.rosetta')) {
      files.push({ path, content: decoder.decode(tar.subarray(offset, offset + size)) });
    }

    offset += dataBlocks * BLOCK;
  }

  return files;
}

function stampNamespacesIntoModelJson(modelJson, namespace, bigIntReplacer) {
  let parsed;
  try {
    parsed = JSON.parse(modelJson);
  } catch {
    return modelJson;
  }
  if (!parsed || !Array.isArray(parsed.elements)) return modelJson;
  for (const el of parsed.elements) {
    if (el && typeof el === 'object') el.$namespace = namespace;
  }
  return JSON.stringify(parsed, bigIntReplacer);
}

async function buildArtifact(source, archiveBytes) {
  const { createRuneDslServices, serializeRuneModel, runeBigIntReplacer, namespaceFromModelName } =
    await import('../packages/core/dist/index.js');

  const rosettaFiles = extractRosettaFiles(archiveBytes);
  console.log(`  Found ${rosettaFiles.length} .rosetta files`);
  if (rosettaFiles.length === 0) throw new Error(`${source.id}: no .rosetta files`);

  const { RuneDsl } = createRuneDslServices();
  const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
  const builder = RuneDsl.shared.workspace.DocumentBuilder;
  const serializer = RuneDsl.serializer.JsonSerializer;

  console.log(`  Parsing through Langium...`);
  const documents = rosettaFiles.map((file) =>
    factory.fromString(file.content, URI.parse(`[${source.id}]/${file.path}`))
  );
  await builder.build(documents, { validation: false });

  console.log(`  Serializing with textRegions...`);
  const version = new Date().toISOString().slice(0, 10);
  const artifact = {
    schemaVersion: 1,
    kind: 'langium-json-serializer',
    modelId: source.id,
    version,
    langiumVersion: LANGIUM_VERSION,
    documents: documents.map((doc, i) => {
      const model = doc.parseResult.value;
      const exports = [];
      for (let j = 0; j < (model.elements?.length ?? 0); j++) {
        const elem = model.elements[j];
        if (elem?.name && elem?.$type) {
          exports.push({
            type: elem.$type,
            name: elem.name,
            path: `/elements@${j}`
          });
          // Include enum values for cross-file resolution
          if (elem.enumValues) {
            for (let k = 0; k < elem.enumValues.length; k++) {
              const val = elem.enumValues[k];
              if (val?.name) {
                exports.push({
                  type: val.$type ?? 'RosettaEnumValue',
                  name: val.name,
                  path: `/elements@${j}/enumValues@${k}`
                });
              }
            }
          }
        }
      }
      const ns = namespaceFromModelName(model.name);
      const rawModelJson = serializeRuneModel(serializer, model);
      return {
        path: rosettaFiles[i].path,
        modelJson: ns ? stampNamespacesIntoModelJson(rawModelJson, ns, runeBigIntReplacer) : rawModelJson,
        exports
      };
    })
  };

  const json = JSON.stringify(artifact, runeBigIntReplacer);
  const gzipped = gzipSync(Buffer.from(json));
  return {
    bytes: gzipped,
    sha256: sha256Hex(gzipped),
    sizeBytes: gzipped.byteLength,
    documentCount: rosettaFiles.length,
    documents: artifact.documents,
    version
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  let failed = false;

  for (const source of SOURCES) {
    console.log(`\n=== ${source.id} ===`);
    const outDir = `${OUT_DIR}/${source.id}`;
    await mkdir(outDir, { recursive: true });

    try {
      const archiveBytes = await downloadArchive(source);
      const archiveSha = sha256Hex(archiveBytes);
      console.log(`  Archive: ${archiveBytes.byteLength} bytes, SHA: ${archiveSha.slice(0, 16)}...`);

      const result = await buildArtifact(source, archiveBytes);
      console.log(`  Artifact: ${result.sizeBytes} bytes, ${result.documentCount} documents`);

      await writeFile(`${outDir}/latest.serialized.json.gz`, result.bytes);

      // ── Per-namespace artifacts ────────────────────────────────────────────
      const graph = computeNamespaceGraph(result.documents, source.id);

      // Build a path→ns lookup so we group by the graph's assignments
      const pathToNs = new Map();
      for (const [ns, entry] of Object.entries(graph)) {
        for (const d of entry.docs) pathToNs.set(d.path, ns);
      }

      // Group FULL docs (with original {type,name,path} exports) by namespace
      const nsDocs = {};
      for (const doc of result.documents) {
        const ns = pathToNs.get(doc.path);
        if (!ns) continue;
        (nsDocs[ns] ??= []).push(doc);
      }

      const nsDir = `${outDir}/ns`;
      await mkdir(nsDir, { recursive: true });

      let totalNsBytes = 0;
      const nsCount = Object.keys(graph).length;

      // Map each namespace to an R2-safe artifact slug. R2/wrangler reject keys
      // containing `..` (path-traversal guard), and leading/trailing dots are
      // unsafe as path segments. Rosetta namespaces are dot-separated
      // identifiers, but the upstream corpus is not always clean — e.g. rune-fpml
      // declares `namespace fpml.consolidated.` (trailing dot), which would
      // produce `fpml.consolidated..json.gz`. Collapse repeated dots and strip
      // edge dots for the FILENAME/KEY only; the namespace identity (the map key
      // below, used for closure + display) is preserved verbatim. Fail loudly on
      // a slug collision rather than silently overwriting one namespace's blob.
      const nsToSlug = new Map();
      const slugToNs = new Map();
      for (const ns of Object.keys(graph)) {
        const slug = nsArtifactSlug(ns);
        if (slugToNs.has(slug)) {
          throw new Error(
            `${source.id}: namespace artifact slug collision — "${ns}" and "${slugToNs.get(slug)}" both map to "${slug}"`
          );
        }
        slugToNs.set(slug, ns);
        nsToSlug.set(ns, slug);
      }

      for (const ns of Object.keys(graph)) {
        const nsDocList = nsDocs[ns] ?? [];
        const nsJson = JSON.stringify({ documents: nsDocList });
        const nsGzipped = gzipSync(Buffer.from(nsJson));
        await writeFile(`${nsDir}/${nsToSlug.get(ns)}.json.gz`, nsGzipped);
        totalNsBytes += nsGzipped.byteLength;
      }

      console.log(`  Per-ns: ${nsCount} namespaces, ${totalNsBytes} total bytes`);

      // Build namespaces map for the meta. The map KEY is the real namespace
      // (used by /api/parse for closure + the explorer); the `artifact` value
      // uses the R2-safe slug so the key matches the uploaded blob filename.
      const version = result.version;
      const namespacesMap = {};
      for (const [ns, entry] of Object.entries(graph)) {
        namespacesMap[ns] = {
          deps: entry.deps,
          exports: entry.exports,
          // Absolute URL (consistent with archiveUrl + serializedWorkspace.url) so
          // any consumer fetches it directly; relative paths 404 against a page URL.
          artifact: `${MIRROR_BASE}/${source.id}/artifacts/${version}/ns/${nsToSlug.get(ns)}.json.gz`
        };
      }

      await writeFile(
        `${outDir}/artifact-meta.json`,
        JSON.stringify(
          {
            modelId: source.id,
            version,
            sha256: result.sha256,
            sizeBytes: result.sizeBytes,
            documentCount: result.documentCount,
            archiveSha256: archiveSha,
            archiveSizeBytes: archiveBytes.byteLength,
            namespaces: namespacesMap
          },
          null,
          2
        )
      );
      console.log(`  ✓ ${outDir}/`);
    } catch (err) {
      console.error(`  ✗ ${err.message}`);
      failed = true;
    }
  }

  if (failed) process.exit(1);
}

main();
