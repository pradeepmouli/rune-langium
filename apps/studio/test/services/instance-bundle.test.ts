// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, expect, it } from 'vitest';
import { OpfsFs } from '../../src/opfs/opfs-fs.js';
import { createOpfsRoot } from '../setup/opfs-mock.js';
import { writeInstance } from '../../src/opfs/instances-fs.js';
import { createTarGz } from '../../src/opfs/tar-untar.js';
import { exportBundle, importBundle } from '../../src/services/instance-bundle.js';
import type { InstanceRecord } from '@rune-langium/codegen/instances';

function fakeDocs(text: string) {
  return [{ textDocument: { getText: () => text } }] as never;
}

const RECORD: InstanceRecord = {
  id: '01J000000000000000000001',
  name: 'My Party',
  typeFqn: 'test.Party',
  data: { name: 'Acme' },
  createdAt: 1000,
  modifiedAt: 1000
};

describe('instance bundle export/import', () => {
  it('round-trips one instance through export and import against the SAME model', async () => {
    const fs = new OpfsFs(createOpfsRoot() as never);
    await writeInstance(fs, '/ws1', RECORD);
    const docs = fakeDocs('namespace test\ntype Party:\n  name string (1..1)\n');

    const bytes = await exportBundle(fs, '/ws1', docs);

    const fs2 = new OpfsFs(createOpfsRoot() as never);
    const result = await importBundle(fs2, '/ws2', bytes, docs);

    expect(result.stale).toBe(false);
    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]?.name).toBe('My Party');
  });

  it('flags imported instances stale when the model text differs from the manifest fingerprint', async () => {
    const fs = new OpfsFs(createOpfsRoot() as never);
    await writeInstance(fs, '/ws1', RECORD);
    const originalDocs = fakeDocs('namespace test\ntype Party:\n  name string (1..1)\n');
    const bytes = await exportBundle(fs, '/ws1', originalDocs);

    const changedDocs = fakeDocs('namespace test\ntype Party:\n  name string (1..1)\n  extra string (0..1)\n');
    const fs2 = new OpfsFs(createOpfsRoot() as never);
    const result = await importBundle(fs2, '/ws2', bytes, changedDocs);

    expect(result.stale).toBe(true);
  });

  it('rethrows a clearly-messaged, distinguishable error when the bundle manifest is corrupt', async () => {
    const fs = new OpfsFs(createOpfsRoot() as never);
    const docs = fakeDocs('namespace test\ntype Party:\n  name string (1..1)\n');

    // A structurally-valid gzip/tar archive whose manifest.json is not
    // valid JSON — simulates a corrupted/truncated bundle file.
    const corruptBytes = createTarGz([
      { path: 'manifest.json', data: new TextEncoder().encode('{ this is not valid json') }
    ]);

    await expect(importBundle(fs, '/ws2', corruptBytes, docs)).rejects.toThrow(/Invalid bundle/);
  });

  it('rethrows a clearly-messaged, distinguishable error when the bundle bytes are not valid gzip/tar at all', async () => {
    const fs = new OpfsFs(createOpfsRoot() as never);
    const docs = fakeDocs('namespace test\ntype Party:\n  name string (1..1)\n');

    // Not a gzip archive at all (no gzip magic header) — simulates a user
    // selecting the wrong file entirely, as opposed to a corrupted-but-valid
    // archive. This exercises the extractTarGz call site specifically.
    const notGzipBytes = new Uint8Array([1, 2, 3, 4, 5]);

    await expect(importBundle(fs, '/ws2', notGzipBytes, docs)).rejects.toThrow(/Invalid bundle/);
  });
});
