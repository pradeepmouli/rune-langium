// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function publication(
  t,
  {
    failUpload = '',
    missingBundle = false,
    missingArtifact = false,
    failManifest = false,
    dependencyVersion = 'v2'
  } = {}
) {
  const root = mkdtempSync(join(tmpdir(), 'curated-upload-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'bin'));
  const objects = join(root, 'objects');
  mkdirSync(objects);
  copyFileSync(new URL('./upload-serialized-artifacts.sh', import.meta.url), join(root, 'scripts/upload.sh'));
  const log = join(root, 'uploads');
  writeFileSync(log, '');
  writeFileSync(
    join(root, 'bin/pnpm'),
    `#!/usr/bin/env bash
set -eu
key="$8"
echo "$key" >> "$UPLOAD_LOG"
if [[ -n "$FAIL_UPLOAD" && "$key" == $FAIL_UPLOAD ]]; then exit 42; fi
mkdir -p "$OBJECTS/$(dirname "$key")"
cp "\${10}" "$OBJECTS/$key"
`,
    { mode: 0o755 }
  );
  writeFileSync(
    join(root, 'bin/curl'),
    `#!/usr/bin/env bash
set -eu
if [[ "$FAIL_MANIFEST" == "1" && "$2" == */z-dependency/* ]]; then exit 22; fi
printf '%s' '{"schemaVersion":1,"artifacts":{}}'
`,
    { mode: 0o755 }
  );
  for (const model of missingBundle ? ['a-consumer'] : ['a-consumer', 'z-dependency']) {
    const dir = join(root, 'dist/curated-artifacts', model);
    mkdirSync(join(dir, 'ns'), { recursive: true });
    if (!(missingArtifact && model === 'z-dependency')) writeFileSync(join(dir, 'latest.serialized.json.gz'), 'blob');
    writeFileSync(join(dir, 'ns', `${model}.json.gz`), 'namespace');
    writeFileSync(
      join(dir, 'artifact-meta.json'),
      JSON.stringify({
        version: model === 'z-dependency' ? dependencyVersion : 'v2',
        langiumVersion: '4.3.1',
        sha256: 'hash',
        sizeBytes: 4,
        documentCount: 1,
        dependencies: model === 'a-consumer' ? { 'z-dependency': 'latest' } : {}
      })
    );
  }
  const result = spawnSync('bash', [join(root, 'scripts/upload.sh')], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(root, 'bin')}:${process.env.PATH}`,
      UPLOAD_LOG: log,
      OBJECTS: objects,
      FAIL_UPLOAD: failUpload,
      FAIL_MANIFEST: failManifest ? '1' : '0'
    }
  });
  const uploads = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean);
  const published = new Map(
    uploads
      .filter((key) => existsSync(join(objects, key)))
      .map((key) => [key, readFileSync(join(objects, key), 'utf8')])
  );
  return { result, uploads, published };
}

const versioned = [
  'rune-curated-mirror/curated/a-consumer/artifacts/v2.serialized.json.gz',
  'rune-curated-mirror/curated/a-consumer/artifacts/v2/ns/a-consumer.json.gz',
  'rune-curated-mirror/curated/z-dependency/artifacts/v2.serialized.json.gz',
  'rune-curated-mirror/curated/z-dependency/artifacts/v2/ns/z-dependency.json.gz'
];

test('changes the manifest cohort when a dependency changes but the consumer blob does not', (t) => {
  const first = publication(t);
  const second = publication(t, { dependencyVersion: 'v3' });
  assert.equal(first.result.status, 0, first.result.stderr);
  assert.equal(second.result.status, 0, second.result.stderr);
  const key = 'rune-curated-mirror/curated/a-consumer/manifest.json';
  const before = JSON.parse(first.published.get(key));
  const after = JSON.parse(second.published.get(key));
  assert.equal(before.artifacts.serializedWorkspace.url, after.artifacts.serializedWorkspace.url);
  assert.notEqual(before.cohort, after.cohort);
  assert.notEqual(before.dependencies['z-dependency'], after.dependencies['z-dependency']);
});

test('publishes every versioned dependency blob before latest pointers and manifests', (t) => {
  const { result, uploads, published } = publication(t);
  const manifest = JSON.parse(published.get('rune-curated-mirror/curated/a-consumer/manifest.json'));
  const cohort = manifest.cohort;
  assert.match(cohort, /^cohort-[a-f0-9]{64}$/);
  assert.deepEqual(manifest.dependencies, { 'z-dependency': cohort });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(uploads, [
    ...versioned,
    `rune-curated-mirror/curated/a-consumer/artifacts/${cohort}/manifest.json`,
    `rune-curated-mirror/curated/z-dependency/artifacts/${cohort}/manifest.json`,
    'rune-curated-mirror/curated/a-consumer/latest.serialized.json.gz',
    'rune-curated-mirror/curated/a-consumer/manifest.json',
    'rune-curated-mirror/curated/z-dependency/latest.serialized.json.gz',
    'rune-curated-mirror/curated/z-dependency/manifest.json'
  ]);
});

for (const failUpload of versioned.slice(2)) {
  test(`does not publish pointers when the later dependency upload fails: ${failUpload}`, (t) => {
    const { result, uploads } = publication(t, { failUpload });
    assert.equal(result.status, 42, result.stderr);
    assert.ok(uploads.length >= 3);
    assert.ok(uploads.every((key) => key.includes('/artifacts/')));
  });
}

for (const options of [{ missingBundle: true }, { missingArtifact: true }, { failManifest: true }]) {
  test(`does not upload anything when preparation fails: ${JSON.stringify(options)}`, (t) => {
    const { result, uploads } = publication(t, options);
    assert.notEqual(result.status, 0);
    assert.deepEqual(uploads, []);
  });
}

for (const failUpload of [
  'rune-curated-mirror/curated/a-consumer/latest.serialized.json.gz',
  'rune-curated-mirror/curated/a-consumer/manifest.json',
  'rune-curated-mirror/curated/z-dependency/latest.serialized.json.gz',
  'rune-curated-mirror/curated/z-dependency/manifest.json'
]) {
  test(`published manifests retain a complete pinned cohort after failure: ${failUpload}`, (t) => {
    const { result, published } = publication(t, { failUpload });
    assert.equal(result.status, 42, result.stderr);
    const immutable = [...published.keys()].filter((key) => key.includes('/artifacts/cohort-'));
    assert.equal(immutable.length, 2);
    for (const key of [...published.keys()].filter((key) => key.endsWith('/manifest.json'))) {
      const manifest = JSON.parse(published.get(key));
      for (const [id, version] of Object.entries(manifest.dependencies)) {
        const dependency = JSON.parse(
          published.get(`rune-curated-mirror/curated/${id}/artifacts/${version}/manifest.json`)
        );
        assert.equal(dependency.cohort, manifest.cohort);
        const blobKey = dependency.artifacts.serializedWorkspace.url.replace(
          'https://www.daikonic.dev/',
          'rune-curated-mirror/'
        );
        assert.ok(published.has(blobKey));
      }
    }
  });
}

test('does not advance latest when an immutable dependency manifest upload fails', (t) => {
  const { result, uploads } = publication(t, { failUpload: '*/z-dependency/artifacts/cohort-*/manifest.json' });
  assert.equal(result.status, 42, result.stderr);
  assert.ok(uploads.every((key) => key.includes('/artifacts/')));
});
