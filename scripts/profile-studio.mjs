#!/usr/bin/env node
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
//
// Launches Studio in a persistent Chromium context with the React DevTools
// extension loaded, then captures a CPU profile via CDP while simulating
// typical user interactions. Saves profile.json for import into Chrome
// DevTools → Performance tab (or speedscope.app).
//
// Usage:
//   node scripts/profile-studio.mjs [--url http://localhost:5173] [--out profile.json]

import { createRequire } from 'module';
const studioRequire = createRequire(new URL('../apps/studio/package.json', import.meta.url));
const { chromium } = studioRequire('@playwright/test');
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const REACT_DEVTOOLS_PATH =
  `${process.env.HOME}/Library/Application Support/Google/Chrome/Default/Extensions/` +
  `fmkadmapgofadopljbjfkapdkoienihi/7.0.1_0`;

const url = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://localhost:5173';

const outFile = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : 'profile.json';

const userDataDir = join(tmpdir(), 'playwright-profile-studio');

console.log(`Studio URL : ${url}`);
console.log(`Output     : ${outFile}`);
console.log(`React DevTools: ${REACT_DEVTOOLS_PATH}`);

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [
    `--disable-extensions-except=${REACT_DEVTOOLS_PATH}`,
    `--load-extension=${REACT_DEVTOOLS_PATH}`,
    '--no-sandbox',
  ],
});

const page = context.pages()[0] ?? await context.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

// Give React time to mount
await page.waitForTimeout(1000);

// --- Pre-profile: load CDM and wait for graph ---
console.log('\nPre-profile: loading CDM reference model...');
console.log('  Waiting for landing page to settle...');
await page.waitForTimeout(2000);

// Try clicking CDM button
try {
  const cdmBtn = page.locator('text=CDM (Common Domain Model)');
  await cdmBtn.waitFor({ timeout: 10000 });
  await cdmBtn.click();
  console.log('  Clicked CDM button');
} catch { console.log('  (CDM button not found, may already be loaded)'); }

// CDM downloads ~10 MB from GitHub and extracts — can take 30–90s first time
console.log('  Waiting for graph (CDM download + OPFS write can take up to 90s)...');
try {
  await page.waitForSelector('.react-flow__node', { timeout: 90000 });
  await page.waitForTimeout(3000); // let rendering settle
  const preNodes = await page.locator('.react-flow__node').count();
  console.log(`  Graph ready: ${preNodes} nodes`);
} catch {
  console.log('  Graph did not load in time — profiling load phase instead');
}

// Attach CDP session for CPU profiling
const cdp = await context.newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 100 }); // µs
await cdp.send('Profiler.start');

console.log('Profiling started — interacting with the app...');

// --- Simulate interactions (post-load, graph visible) ---

// 1. Click graph nodes
const nodes = await page.locator('.react-flow__node').all();
console.log(`  Clicking ${Math.min(8, nodes.length)} nodes...`);
for (let i = 0; i < Math.min(8, nodes.length); i++) {
  try {
    await nodes[i].click({ timeout: 2000 });
    await page.waitForTimeout(400);
  } catch { /* skip inaccessible nodes */ }
}

// 2. Switch tabs (Code / Form / Code)
for (const label of ['Code', 'Form', 'Code', 'Form']) {
  try {
    await page.click(`[role="tab"]:has-text("${label}")`, { timeout: 2000 });
    await page.waitForTimeout(500);
  } catch { /* tab may not exist */ }
}

// 3. Search / filter in editor if available
try {
  await page.keyboard.press('Escape');
} catch { /* ignore */ }

await page.waitForTimeout(800);

// --- Stop profiling ---
const { profile } = await cdp.send('Profiler.stop');
await cdp.send('Profiler.disable');

writeFileSync(outFile, JSON.stringify(profile, null, 2));
console.log(`\nProfile saved → ${outFile}`);
console.log('Import in Chrome DevTools → Performance → Load profile (⬆ icon)');
console.log('Or open at https://www.speedscope.app and drag the file in.\n');

await context.close();
