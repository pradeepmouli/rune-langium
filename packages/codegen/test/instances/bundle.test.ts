import { describe, expect, it } from 'vitest';
import { buildManifest, parseManifest, serializeManifest, type InstanceRecord } from '../../src/instances/bundle.js';

const RECORD: InstanceRecord = {
  id: '01J000000000000000000001',
  name: 'My Party',
  typeFqn: 'test.Party',
  data: { name: 'Acme Corp' },
  createdAt: 1000,
  modifiedAt: 1000
};

describe('bundle manifest', () => {
  it('round-trips through serialize/parse', () => {
    const manifest = buildManifest([RECORD], 'deadbeef', undefined);
    const json = serializeManifest(manifest);
    const parsed = parseManifest(json);
    expect(parsed).toEqual(manifest);
  });

  it('includes gitCommitSha only when provided, never as the gating field', () => {
    const withGit = buildManifest([RECORD], 'deadbeef', 'abc1234');
    expect(withGit.modelFingerprint).toBe('deadbeef');
    expect(withGit.gitCommitSha).toBe('abc1234');

    const withoutGit = buildManifest([RECORD], 'deadbeef', undefined);
    expect(withoutGit.gitCommitSha).toBeUndefined();
  });

  it('rejects a manifest with an unknown formatVersion', () => {
    const bad = JSON.stringify({ formatVersion: 999, modelFingerprint: 'x', instances: [] });
    expect(() => parseManifest(bad)).toThrow(/formatVersion/);
  });
});
