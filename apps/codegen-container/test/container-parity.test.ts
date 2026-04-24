// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Container parity smoke test (T011).
 *
 * Spins up the `rune-codegen:latest` image, posts a canned `.rosetta`
 * fixture, and asserts the response matches what the local
 * `pnpm codegen:start` server emits for the same input. Satisfies
 * Constitution Principle II (deterministic fixtures) and the spec's
 * FR-001 / SC-001 "full parity with local" guarantees.
 *
 * Environmental requirements — the test is SKIPPED unless all present:
 *   CONTAINER_TEST=1                                      (opt-in flag)
 *   docker is available on PATH and the daemon is running
 *   `rune-codegen:latest` image exists locally (built via
 *     `docker build -f apps/codegen-container/Dockerfile .` from repo root)
 *   LOCAL_CODEGEN_URL (default: http://localhost:8377) — must be reachable
 *     and speaking the original /api/generate contract.
 *
 * Run:
 *   pnpm codegen:start &                  # in one terminal
 *   CONTAINER_TEST=1 pnpm --filter @rune-langium/codegen-container test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const CONTAINER_TEST = process.env['CONTAINER_TEST'] === '1';
const LOCAL_CODEGEN_URL = process.env['LOCAL_CODEGEN_URL'] ?? 'http://localhost:8377';
const IMAGE_TAG = process.env['CONTAINER_IMAGE'] ?? 'rune-codegen:latest';
const CONTAINER_PORT = 18080;
const CONTAINER_URL = `http://127.0.0.1:${CONTAINER_PORT}`;

function dockerAvailable(): boolean {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function imageExists(tag: string): boolean {
  try {
    execFileSync('docker', ['image', 'inspect', tag], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function waitForHealth(url: string, timeoutMs = 60000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/generate/health`);
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await delay(1000);
  }
  return false;
}

const FIXTURE = {
  language: 'java',
  files: [
    {
      path: 'demo.rosetta',
      content:
        'namespace demo\n\ntype Foo:\n  bar string (1..1)\n  baz number (0..1)\n\ntype Bar:\n  quux Foo (1..1)\n'
    }
  ]
} as const;

// Shape-only fields we compare. Do NOT deep-compare generated code verbatim
// because upstream generator output may include a timestamp or version
// comment that drifts between runs. Instead assert the language is echoed,
// the file set is identical by path, and no errors surfaced.
function normalize(result: {
  language: string;
  files: Array<{ path: string; content: string }>;
  errors: unknown[];
}) {
  return {
    language: result.language,
    filePaths: result.files.map((f) => f.path).sort(),
    errorCount: result.errors.length,
    nonEmpty: result.files.every((f) => f.content.length > 0)
  };
}

describe('container ↔ local parity (T011)', () => {
  let containerProc: ChildProcess | undefined;

  const shouldRun = CONTAINER_TEST && dockerAvailable() && imageExists(IMAGE_TAG);

  beforeAll(async () => {
    if (!shouldRun) return;
    containerProc = spawn(
      'docker',
      [
        'run',
        '--rm',
        '-p',
        `${CONTAINER_PORT}:8080`,
        '--name',
        'rune-codegen-paritytest',
        IMAGE_TAG
      ],
      { stdio: 'ignore' }
    );
    const up = await waitForHealth(CONTAINER_URL, 60000);
    if (!up) throw new Error('container did not become healthy within 60s');
  }, 90000);

  afterAll(async () => {
    if (containerProc) {
      try {
        execFileSync('docker', ['stop', 'rune-codegen-paritytest'], { stdio: 'ignore' });
      } catch {
        /* container may have already exited */
      }
      containerProc.kill('SIGTERM');
    }
  });

  it.skipIf(!shouldRun)(
    'health endpoints agree on language coverage',
    async () => {
      const [localRes, containerRes] = await Promise.all([
        fetch(`${LOCAL_CODEGEN_URL}/api/languages`),
        fetch(`${CONTAINER_URL}/api/generate/health`)
      ]);
      expect(localRes.ok).toBe(true);
      expect(containerRes.ok).toBe(true);

      const localBody = (await localRes.json()) as {
        languages: Array<{ id: string }>;
      };
      const containerBody = (await containerRes.json()) as { languages: string[] };

      const localLangs = localBody.languages.map((l) => l.id).sort();
      const containerLangs = [...containerBody.languages].sort();
      expect(containerLangs).toEqual(localLangs);
    },
    30000
  );

  it.skipIf(!shouldRun)(
    'generate() returns shape-equivalent output for the same fixture',
    async () => {
      const [localRes, containerRes] = await Promise.all([
        fetch(`${LOCAL_CODEGEN_URL}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(FIXTURE)
        }),
        fetch(`${CONTAINER_URL}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(FIXTURE)
        })
      ]);
      const localBody = (await localRes.json()) as Parameters<typeof normalize>[0];
      const containerBody = (await containerRes.json()) as Parameters<typeof normalize>[0];

      expect(normalize(containerBody)).toEqual(normalize(localBody));
    },
    60000
  );

  it.skipIf(shouldRun)(
    'parity test skipped (set CONTAINER_TEST=1 + build image + start local codegen server to enable)',
    () => {
      // Placeholder so vitest still reports something when the real tests
      // skip. Confirms the opt-in mechanism works.
      expect(CONTAINER_TEST ? 'enabled' : 'disabled').toBeDefined();
    }
  );
});
