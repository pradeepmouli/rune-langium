// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { expect, it } from 'vitest';
import { handleCodegenDownload } from '../../src/services/codegen-download-handler.js';
import { decodeExportArtifact } from '../../src/services/export-artifact.js';

const source = `namespace test
type Address:
  city string (1..1)
type Party:
  address Address (1..1)
type Unrelated:
  ignored string (1..1)`;

it('decodes the exact generated artifact envelope for a selected declaration', async () => {
  const response = await handleCodegenDownload({
    request: new Request('http://localhost/api/codegen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: [{ path: 'party.rune', content: source }],
        target: 'typescript',
        artifactEnvelope: 1,
        options: { typescript: { layout: 'per-namespace' } },
        selection: { namespaces: [], declarations: [{ namespace: 'test', name: 'Party', kind: 'Data' }] }
      })
    })
  });

  expect(response.status).toBe(200);
  const artifact = await decodeExportArtifact(response);
  expect(artifact.manifest.files).toHaveLength(1);
  expect(artifact.manifest.files[0]?.path).not.toBe('.rune/export.json');
  const file = artifact.manifest.files[0]!;
  const text = await artifact.readText(file.path);
  expect(text).toMatch(/(?:class|interface|type|enum)\s+Address\b/);
  expect(text).toMatch(/(?:class|interface|type|enum)\s+Party\b/);
  expect(text).not.toMatch(/(?:class|interface|type|enum)\s+Unrelated\b/);
});

it('rejects manifest paths that are not listed as text files', async () => {
  const response = new Response(
    await new Blob([
      new Uint8Array([80, 75, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    ]).arrayBuffer(),
    { status: 200 }
  );
  await expect(decodeExportArtifact(response)).rejects.toThrow('missing .rune/export.json');
});
