// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { createRuneDslServices } from '@rune-langium/core';
import type {
  CuratedModelId,
  CuratedSerializedWorkspaceArtifact
} from '@rune-langium/curated-schema';
import { URI } from 'langium';
import { gzip, inflate } from 'pako';
import { sha256Hex } from './manifest.js';

const BLOCK = 512;
const LANGIUM_VERSION = '4.2.2';

const { RuneDsl } = createRuneDslServices();
const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
const builder = RuneDsl.shared.workspace.DocumentBuilder;
const serializer = RuneDsl.serializer.JsonSerializer;

interface TarEntry {
  path: string;
  size: number;
  typeflag: string;
  dataOffset: number;
}

export interface SerializedArtifactBuildResult {
  bytes: Uint8Array;
  sha256: string;
  sizeBytes: number;
  documentCount: number;
}

export async function buildSerializedWorkspaceArtifact(
  modelId: CuratedModelId,
  version: string,
  archiveBytes: Uint8Array
): Promise<SerializedArtifactBuildResult> {
  const rosettaFiles = readRosettaFilesFromTarGz(archiveBytes);
  if (rosettaFiles.length === 0) {
    throw new Error(`curated source ${modelId}@${version} contained no .rosetta files`);
  }

  const documents = rosettaFiles.map((file) =>
    factory.fromString(file.content, URI.parse(`[${modelId}]/${file.path}`))
  );
  await builder.build(documents, { validation: false });

  const artifact: CuratedSerializedWorkspaceArtifact = {
    schemaVersion: 1,
    kind: 'langium-json-serializer',
    modelId,
    version,
    langiumVersion: LANGIUM_VERSION,
    documents: documents.map((document, index) => ({
      path: rosettaFiles[index]!.path,
      modelJson: serializer.serialize(document.parseResult.value, { refText: true })
    }))
  };

  const bytes = gzip(new TextEncoder().encode(JSON.stringify(artifact)));
  return {
    bytes,
    sha256: await sha256Hex(bytes),
    sizeBytes: bytes.byteLength,
    documentCount: artifact.documents.length
  };
}

function readRosettaFilesFromTarGz(
  archiveBytes: Uint8Array
): Array<{ path: string; content: string }> {
  const tar = inflate(archiveBytes);
  const decoder = new TextDecoder('utf-8');
  const files: Array<{ path: string; content: string }> = [];

  let offset = 0;
  while (offset + BLOCK <= tar.byteLength) {
    const headerBlock = tar.subarray(offset, offset + BLOCK);
    if (isAllZero(headerBlock)) break;
    const entry = parseTarEntry(headerBlock, offset + BLOCK);
    offset += BLOCK;

    const dataBlocks = Math.ceil(entry.size / BLOCK);
    const dataEnd = entry.dataOffset + entry.size;
    if (entry.typeflag === '0' || entry.typeflag === '\0' || entry.typeflag === '') {
      if (entry.path.endsWith('.rosetta')) {
        files.push({
          path: entry.path,
          content: decoder.decode(tar.subarray(entry.dataOffset, dataEnd))
        });
      }
    } else if (entry.typeflag === '5' || entry.typeflag === 'g' || entry.typeflag === 'x') {
      // Directories and PAX headers don't contribute documents.
    } else if (entry.typeflag === '1' || entry.typeflag === '2') {
      throw new Error(`tar: links not supported (path=${entry.path})`);
    } else {
      throw new Error(`tar: unsupported typeflag '${entry.typeflag}' (path=${entry.path})`);
    }

    offset += dataBlocks * BLOCK;
  }

  return files;
}

function parseTarEntry(block: Uint8Array, dataOffset: number): TarEntry {
  const decoder = new TextDecoder('utf-8');
  const slice = (start: number, end: number): string => {
    const sub = block.subarray(start, end);
    let last = sub.length;
    while (last > 0 && sub[last - 1] === 0) last--;
    return decoder.decode(sub.subarray(0, last));
  };

  const name = slice(0, 100);
  const sizeOctal = slice(124, 136).trim();
  const typeflag = slice(156, 157) || '\0';
  const prefix = slice(345, 500);
  const size = sizeOctal.length > 0 ? parseInt(sizeOctal, 8) : 0;
  const rawPath = prefix.length > 0 ? `${prefix}/${name}` : name;

  return {
    path: cleanPath(rawPath),
    size,
    typeflag,
    dataOffset
  };
}

function cleanPath(raw: string): string {
  let path = raw;
  if (path.startsWith('./')) path = path.slice(2);
  if (path.endsWith('/')) path = path.slice(0, -1);
  if (path.length === 0) return '';
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) {
    throw new Error(`tar: rejected unsafe path (${raw})`);
  }
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new Error(`tar: rejected path-traversal entry (${raw})`);
    }
  }
  return path;
}

function isAllZero(block: Uint8Array): boolean {
  for (let i = 0; i < block.length; i++) {
    if (block[i] !== 0) return false;
  }
  return true;
}
