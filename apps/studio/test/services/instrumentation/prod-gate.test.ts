// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// NOTE: deliberately NOT `new URL('../../../src/...', import.meta.url)` — in
// this repo's jsdom vitest environment, Vite's import-analysis plugin
// statically rewrites that exact literal-relative-path + import.meta.url
// pattern into an asset URL resolved against jsdom's document base
// (http://localhost:3000), not the real file path, so fileURLToPath() then
// throws "The URL must be of scheme file". dirname()+resolve() avoids the
// pattern the plugin matches on — same convention as test/lang/editor-theme.test.ts.
describe('production dead-code-elimination gate', () => {
  it('withInstrumentation short-circuits on the guarded import.meta.env PROD check', () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/services/instrumentation/core.ts'),
      'utf-8'
    );
    expect(source).toContain('.env?.PROD === true');
  });
});
