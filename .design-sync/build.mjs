// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { execFileSync, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeConfig } from './prepare-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const configPath = writeConfig();
const config = JSON.parse(readFileSync(configPath, 'utf8'));
execSync(config.buildCmd, { cwd: root, stdio: 'inherit' });
execFileSync(
  process.execPath,
  [
    '.ds-sync/package-build.mjs',
    '--config',
    configPath,
    '--node-modules',
    'packages/design-system/node_modules',
    '--entry',
    './packages/design-system/dist/ui/index.js',
    '--out',
    './ds-bundle'
  ],
  { cwd: root, stdio: 'inherit' }
);
