// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, expect, it } from 'vitest';
import { OpfsFs } from '../../src/opfs/opfs-fs.js';
import { createOpfsRoot } from '../setup/opfs-mock.js';
import {
  deleteInstance,
  readInstance,
  readInstanceIndex,
  writeInstance,
  writeInstanceIndex
} from '../../src/opfs/instances-fs.js';
import type { InstanceRecord } from '@rune-langium/codegen/instances';

const RECORD: InstanceRecord = {
  id: '01J000000000000000000001',
  name: 'My Party',
  typeFqn: 'test.Party',
  data: { name: 'Acme' },
  createdAt: 1000,
  modifiedAt: 1000
};

describe('instances-fs', () => {
  it('writes and reads an instance record', async () => {
    const fs = new OpfsFs(createOpfsRoot() as never);
    await writeInstance(fs, '/ws1', RECORD);
    const read = await readInstance(fs, '/ws1', RECORD.id);
    expect(read).toEqual(RECORD);
  });

  it('writes and reads the index', async () => {
    const fs = new OpfsFs(createOpfsRoot() as never);
    await writeInstanceIndex(fs, '/ws1', [
      { id: RECORD.id, name: RECORD.name, typeFqn: RECORD.typeFqn, modifiedAt: RECORD.modifiedAt }
    ]);
    const index = await readInstanceIndex(fs, '/ws1');
    expect(index).toHaveLength(1);
    expect(index[0]?.id).toBe(RECORD.id);
  });

  it('returns an empty index when none has been written yet', async () => {
    const fs = new OpfsFs(createOpfsRoot() as never);
    expect(await readInstanceIndex(fs, '/ws1')).toEqual([]);
  });

  it('deletes an instance file', async () => {
    const fs = new OpfsFs(createOpfsRoot() as never);
    await writeInstance(fs, '/ws1', RECORD);
    await deleteInstance(fs, '/ws1', RECORD.id);
    await expect(readInstance(fs, '/ws1', RECORD.id)).rejects.toThrow();
  });
});
