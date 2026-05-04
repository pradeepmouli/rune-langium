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

const corePkgDir = new URL('../packages/core/', import.meta.url);
const langiumIndex = new URL('node_modules/langium/lib/index.js', corePkgDir);
const { URI } = await import(langiumIndex);

const SOURCES = [
  { id: 'cdm', owner: 'REGnosys', repo: 'rosetta-cdm', ref: 'master' },
  { id: 'fpml', owner: 'rosetta-models', repo: 'rune-fpml', ref: 'master' },
  { id: 'rune-dsl', owner: 'finos', repo: 'rune-dsl', ref: 'main' },
];

const LANGIUM_VERSION = '4.2.2';
const OUT_DIR = 'dist/curated-artifacts';

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

async function buildArtifact(source, archiveBytes) {
  const { createRuneDslServices } = await import('../packages/core/dist/index.js');

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
    documents: documents.map((doc, i) => ({
      path: rosettaFiles[i].path,
      modelJson: serializer.serialize(doc.parseResult.value, {
        refText: true,
        textRegions: true,
        replacer: (key, value, defaultReplacer) =>
          typeof value === 'bigint' ? Number(value) : defaultReplacer(key, value),
      }),
    })),
  };

  const json = JSON.stringify(artifact, (_key, value) =>
    typeof value === 'bigint' ? Number(value) : value
  );
  const gzipped = gzipSync(Buffer.from(json));
  return {
    bytes: gzipped,
    sha256: sha256Hex(gzipped),
    sizeBytes: gzipped.byteLength,
    documentCount: rosettaFiles.length,
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
      await writeFile(
        `${outDir}/artifact-meta.json`,
        JSON.stringify(
          {
            modelId: source.id,
            version: new Date().toISOString().slice(0, 10),
            sha256: result.sha256,
            sizeBytes: result.sizeBytes,
            documentCount: result.documentCount,
            archiveSha256: archiveSha,
            archiveSizeBytes: archiveBytes.byteLength,
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
