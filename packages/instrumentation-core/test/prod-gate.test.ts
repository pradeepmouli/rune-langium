// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// NOTE: deliberately NOT `new URL('../src/...', import.meta.url)` — see
// with-instrumentation.test.ts's sibling suites for why this repo avoids
// that literal-relative-path + import.meta.url pattern in vitest suites.
// dirname()+resolve() sidesteps it regardless of test environment.
describe('production dead-code-elimination gate', () => {
  it('withInstrumentation short-circuits on the guarded import.meta.env PROD check', () => {
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/index.ts'), 'utf-8');
    expect(source).toContain('.env?.PROD === true');
  });
});
