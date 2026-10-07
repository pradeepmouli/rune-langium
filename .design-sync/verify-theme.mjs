// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../.ds-sync/package-build.mjs', import.meta.url));
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(`${root}/ds-bundle/components/overlays/Command/Command.html`).href, {
    waitUntil: 'domcontentloaded'
  });
  await page.locator('[data-slot="command-group"]').first().waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'daikonic');
  const keys = ['--primary', '--secondary', '--color-data', '--color-choice', '--color-enum', '--color-func'];
  const colors = () =>
    page.evaluate(
      (keys) =>
        keys.map((key) => {
          const probe = document.createElement('span');
          probe.style.color = `var(${key})`;
          document.body.appendChild(probe);
          const value = getComputedStyle(probe).color;
          probe.remove();
          return value;
        }),
      keys
    );
  const actual = await colors();
  await page.addStyleTag({ content: readFileSync(`${root}/apps/studio/src/styles/daikonic.css`, 'utf8') });
  assert.deepEqual(actual, await colors());
  console.log('All six palette colors in the generated preview match the authoritative Studio overlay');
  await page.locator('input').first().fill('typescript');
  await page.getByRole('option', { name: /Generate TypeScript/ }).click();
  assert.equal(
    await page.getByRole('status', { name: 'Selection' }).first().textContent(),
    'Selected: Generate TypeScript'
  );
  console.log('Real Chromium Command filtering and selection pass');
} finally {
  await browser.close();
}
