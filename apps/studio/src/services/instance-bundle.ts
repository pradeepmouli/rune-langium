// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import {
  buildManifest,
  computeModelFingerprint,
  parseManifest,
  serializeManifest,
  type InstanceRecord
} from '@rune-langium/codegen/instances';
import type { LangiumDocument } from 'langium';
import { createTarGz, extractTarGz } from '../opfs/tar-untar.js';
import { listInstanceFiles, readInstance, writeInstance } from '../opfs/instances-fs.js';
import type { OpfsFs } from '../opfs/opfs-fs.js';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Serializes every instance in `workspaceRoot` plus a fingerprinted manifest into a tar.gz bundle. */
export async function exportBundle(
  fs: OpfsFs,
  workspaceRoot: string,
  documents: LangiumDocument[]
): Promise<Uint8Array> {
  const files = await listInstanceFiles(fs, workspaceRoot);
  const ids = files.map((f) => f.replace(/\.json$/, ''));
  const records = await Promise.all(ids.map((id) => readInstance(fs, workspaceRoot, id)));

  const fingerprint = await computeModelFingerprint(documents);
  const manifest = buildManifest(records, fingerprint, undefined);

  const entries = [
    { path: 'manifest.json', data: new TextEncoder().encode(serializeManifest(manifest)) },
    ...records.map((r) => ({ path: `instances/${r.id}.json`, data: new TextEncoder().encode(JSON.stringify(r)) }))
  ];
  return createTarGz(entries);
}

/**
 * Extracts a tar.gz bundle into `workspaceRoot`'s instance store, gating
 * `stale` on whether the currently-loaded model's fingerprint matches the
 * bundle manifest's — see design doc §4.
 *
 * A malformed/corrupt bundle — whether the bytes aren't a valid gzip/tar
 * archive at all, the extracted `manifest.json` isn't valid JSON, or an
 * individual instance record's JSON is corrupt — surfaces as a distinctly-
 * messaged "Invalid bundle" error rather than a raw, un-namespaced parser
 * error (e.g. pako's raw gzip-header error, or a raw `SyntaxError`), so a
 * future caller (an import dialog) can present a specific message instead
 * of a parser internals leak.
 */
export async function importBundle(
  fs: OpfsFs,
  workspaceRoot: string,
  bundleBytes: Uint8Array,
  documents: LangiumDocument[]
): Promise<{ imported: InstanceRecord[]; stale: boolean }> {
  const scratchRoot = `${workspaceRoot}/.studio/.bundle-import-scratch`;
  try {
    await extractTarGz(bundleBytes, fs, { pathPrefix: scratchRoot });
  } catch (err) {
    throw new Error(`Invalid bundle: archive could not be extracted (${errMessage(err)})`);
  }

  let manifest;
  try {
    const manifestRaw = await fs.readFile(`${scratchRoot}/manifest.json`, 'utf8');
    manifest = parseManifest(manifestRaw as string);
  } catch (err) {
    throw new Error(`Invalid bundle: manifest could not be parsed (${errMessage(err)})`);
  }

  const currentFingerprint = await computeModelFingerprint(documents);
  const stale = currentFingerprint !== manifest.modelFingerprint;

  const imported: InstanceRecord[] = [];
  for (const entry of manifest.instances) {
    let record: InstanceRecord;
    try {
      const raw = await fs.readFile(`${scratchRoot}/instances/${entry.id}.json`, 'utf8');
      record = JSON.parse(raw as string) as InstanceRecord;
    } catch (err) {
      throw new Error(`Invalid bundle: instance record "${entry.id}" could not be parsed (${errMessage(err)})`);
    }
    const finalRecord: InstanceRecord = stale
      ? { ...record, stale: { reason: 'model-fingerprint-mismatch', diagnostics: [] } }
      : record;
    await writeInstance(fs, workspaceRoot, finalRecord);
    imported.push(finalRecord);
  }

  return { imported, stale };
}
