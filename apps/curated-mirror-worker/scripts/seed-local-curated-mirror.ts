// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Seed the LOCAL R2 bucket (miniflare in-memory) with tiny fixture archives
 * for each curated model id (cdm, fpml, rune-dsl). Without this, the studio
 * dev stack (`pnpm --filter @rune-langium/studio dev:full`) can wire up
 * the CURATED_MIRROR service binding but the bucket is empty — so clicking
 * a curated bundle in the loader returns 404 from the mirror.
 *
 * USAGE:
 *   # In a separate terminal, AFTER `dev:full` is up:
 *   pnpm --filter @rune-langium/curated-mirror-worker run seed:local
 *
 * WHAT GETS WRITTEN:
 *   The studio's /api/parse + browser curated-loader fetch the **pre-parsed
 *   serialized artifact** at `{id}/latest.serialized.json.gz`, NOT the raw
 *   source tar.gz. So the seed must run rosetta source through Langium
 *   (`buildSerializedWorkspaceArtifact` from src/serialized-artifact.ts) and
 *   write the resulting JSON.gz to R2 — otherwise the chip loads but the
 *   document count is 0 and the parser surfaces a workspace error.
 *
 *   Per-model keys written:
 *     curated/{id}/latest.tar.gz                 — source archive (informational)
 *     curated/{id}/archives/{version}.tar.gz     — dated source archive
 *     curated/{id}/latest.serialized.json.gz     — parsed artifact (load-bearing)
 *     curated/{id}/artifacts/{ver}.serialized.json.gz — dated artifact
 *     curated/{id}/manifest.json                 — metadata + history + artifact ref
 *
 * FIXTURE CONTENT:
 *   Sourced from the real local corpora under `.resources/` (gitignored;
 *   ~142 CDM files, ~42 FpML files, ~2 rune-dsl files at time of writing).
 *   Earlier revisions inlined 1–2 toy `.rosetta` strings per bundle but
 *   that's too sparse to exercise Structure View / Graph / Excel codegen
 *   at production scale — the auto-fit, mutex panes, font-scale, and
 *   selection treatments all need real-volume data to validate. The
 *   production CF Pages deploy is populated by the cron-triggered
 *   publisher (src/publisher.ts) from real CDM/FpML/rune-dsl GitHub
 *   releases; this seed mirrors that scale locally.
 *
 *   NOTE: parsing ~142 CDM files through Langium is heap-heavy (the
 *   conversation-summary OOM history of curated-fetch.ts at 128 MB CF
 *   Worker memory motivated the `*.serialized.json.gz` artifact pattern
 *   in the first place). The seed script's `seed:local` npm task sets
 *   `NODE_OPTIONS=--max-old-space-size=4096` to match CI's
 *   curated-artifacts.yml workflow heap budget.
 */

import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildSerializedWorkspaceArtifact } from '../src/serialized-artifact.js';
import type { CuratedManifest, CuratedModelId } from '@rune-langium/curated-schema';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKER_ROOT = dirname(SCRIPT_DIR);
const REPO_ROOT = dirname(dirname(WORKER_ROOT));
const RESOURCES_ROOT = join(REPO_ROOT, '.resources');
const BUCKET = 'rune-curated-mirror';

/**
 * Recursively collect `*.rosetta` files from a `.resources/` subdirectory
 * and return them keyed by their tar archive path (production archive
 * layout: wrapper directory at the root, then `rosetta-source/` or a
 * bundle-specific subpath). The seed reads from the real local CDM/FpML/
 * rune-dsl corpora under `.resources/` so dev:full exercises the same
 * scale of data the production CF Pages deploy serves (~142 CDM files /
 * ~42 FpML files / ~2 rune-dsl files).
 *
 * The archive wrapper paths mirror what `buildSerializedWorkspaceArtifact`
 * already expects to strip (it walks tar entries and removes the top-
 * level wrapper directory to match the URI convention the curated-loader
 * uses on the studio side).
 */
function loadResourceTree(resourceSubdir: string, archiveWrapper: string): Record<string, string> {
  const root = join(RESOURCES_ROOT, resourceSubdir);
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    console.warn(`[seed] WARN: .resources/${resourceSubdir} not found — bundle will be empty`);
    return {};
  }
  const out: Record<string, string> = {};
  for (const name of entries) {
    const full = join(root, name);
    const st = statSync(full);
    if (!st.isFile() || !name.endsWith('.rosetta')) continue;
    // Flat layout: every .rosetta file ends up at <wrapper>/<basename>.
    // Matches the existing seed convention while scaling to the full
    // .resources corpus.
    out[`${archiveWrapper}/${basename(name)}`] = readFileSync(full, 'utf8');
  }
  return out;
}

/**
 * Per-model fixtures, sourced from the real corpora under `.resources/`.
 * User feedback: the previous 3-file synthetic fixture was too sparse to
 * exercise Structure / Graph / Excel codegen meaningfully — and the only
 * way to validate performance characteristics (auto-fit, mutex panes,
 * font-scale zoom) at production data scale is to bundle the same
 * volume that the prod CF Pages deploy serves.
 *
 * Paths inside the tar mimic the production archive layout
 * (codeload.github.com wraps the repo root in `{repo}-{ref}/`);
 * `buildSerializedWorkspaceArtifact` strips the top-level wrapper.
 */
const FIXTURES: Record<CuratedModelId, Record<string, string>> = {
  cdm: loadResourceTree('cdm', 'common-domain-model-local/rosetta-source'),
  fpml: loadResourceTree('rune-fpml', 'fpml-local'),
  'rune-dsl': loadResourceTree('rune-dsl', 'rune-dsl-local')
};

const PUBLIC_ROOT = 'https://www.daikonic.dev/curated';
const LOCAL_LANGIUM_VERSION = '4.2.2'; // matches LANGIUM_VERSION in serialized-artifact.ts

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeArchive(modelId: string, files: Record<string, string>, workdir: string): Uint8Array {
  // Materialize files into workdir, then tar+gz the whole thing. OS tar is
  // reliable across macOS/Linux; Windows users need WSL.
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(workdir, path);
    execFileSync('mkdir', ['-p', dirname(fullPath)]);
    writeFileSync(fullPath, content, 'utf8');
  }
  const archivePath = join(workdir, `${modelId}.tar.gz`);
  execFileSync('tar', ['-czf', archivePath, '-C', workdir, ...Object.keys(files)]);
  return new Uint8Array(readFileSync(archivePath));
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function putR2(key: string, file: string, contentType: string): void {
  // wrangler r2 object put expects {bucket}/{key} as positional. --local
  // alone targets the in-memory miniflare bucket — do NOT also pass
  // --remote=false (yargs treats them as mutually exclusive).
  const result = spawnSync(
    'npx',
    ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`, '--local', '--file', file, '--content-type', contentType],
    { cwd: WORKER_ROOT, stdio: 'inherit' }
  );
  if (result.status !== 0) {
    throw new Error(`wrangler r2 object put failed for ${key} (exit ${result.status})`);
  }
}

function buildManifest(input: {
  modelId: CuratedModelId;
  version: string;
  sha256: string;
  sizeBytes: number;
  generatedAt: string;
  artifactSha256: string;
  artifactSizeBytes: number;
}): CuratedManifest {
  // Sonnet RF review (P1): use the canonical CuratedManifest type from
  // @rune-langium/curated-schema rather than a hand-rolled interface.
  // The schema is the contract; drift would silently produce malformed
  // manifests that the studio's Zod validation rejects at runtime.
  return {
    schemaVersion: 1,
    modelId: input.modelId,
    version: input.version,
    sha256: input.sha256,
    sizeBytes: input.sizeBytes,
    generatedAt: input.generatedAt,
    upstreamCommit: '',
    upstreamRef: 'local-fixture',
    archiveUrl: `${PUBLIC_ROOT}/${input.modelId}/latest.tar.gz`,
    history: [
      {
        version: input.version,
        archiveUrl: `${PUBLIC_ROOT}/${input.modelId}/archives/${input.version}.tar.gz`
      }
    ],
    artifacts: {
      serializedWorkspace: {
        artifactPath: `${input.modelId}/latest.serialized.json.gz`,
        langiumVersion: LOCAL_LANGIUM_VERSION,
        sha256: input.artifactSha256,
        sizeBytes: input.artifactSizeBytes
      }
    }
  };
}

async function main(): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), 'rune-curated-seed-'));
  const version = todayStr();
  const generatedAt = new Date().toISOString();
  let ok = 0;
  try {
    for (const modelIdStr of Object.keys(FIXTURES)) {
      const modelId = modelIdStr as CuratedModelId;
      const files = FIXTURES[modelId];
      const workdir = join(tmp, modelId);
      execFileSync('mkdir', ['-p', workdir]);

      // 1. Build the source archive.
      const archiveBytes = makeArchive(modelId, files, workdir);
      const archiveSha = sha256Hex(archiveBytes);
      const archivePath = join(workdir, `${modelId}.tar.gz`);

      // 2. Build the serialized JSON artifact — same path the production
      //    CI workflow (curated-artifacts.yml) uses. This is what the
      //    studio actually fetches (NOT the .tar.gz).
      const artifact = await buildSerializedWorkspaceArtifact(modelId, version, archiveBytes);
      const artifactPath = join(workdir, `${modelId}.serialized.json.gz`);
      writeFileSync(artifactPath, artifact.bytes);

      console.log(
        `[seed] ${modelId}: archive ${archiveBytes.byteLength}B sha=${archiveSha.slice(0, 8)}… | artifact ${artifact.sizeBytes}B sha=${artifact.sha256.slice(0, 8)}… | docs=${artifact.documentCount}`
      );

      // 3. Write all 5 keys to local R2.
      putR2(`curated/${modelId}/latest.tar.gz`, archivePath, 'application/gzip');
      putR2(`curated/${modelId}/archives/${version}.tar.gz`, archivePath, 'application/gzip');
      putR2(`curated/${modelId}/latest.serialized.json.gz`, artifactPath, 'application/gzip');
      putR2(`curated/${modelId}/artifacts/${version}.serialized.json.gz`, artifactPath, 'application/gzip');

      const manifest = buildManifest({
        modelId,
        version,
        sha256: archiveSha,
        sizeBytes: archiveBytes.byteLength,
        generatedAt,
        artifactSha256: artifact.sha256,
        artifactSizeBytes: artifact.sizeBytes
      });
      const manifestPath = join(workdir, 'manifest.json');
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      putR2(`curated/${modelId}/manifest.json`, manifestPath, 'application/json; charset=utf-8');
      ok++;
    }
    console.log(`\n[seed] OK — wrote ${ok} bundle(s) to local R2 bucket '${BUCKET}'.`);
    console.log(`[seed] Reload http://localhost:8788/rune-studio/studio/ and click a curated bundle.`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

await main();
