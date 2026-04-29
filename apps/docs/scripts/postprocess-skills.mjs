#!/usr/bin/env node
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsRoot = resolve(__dirname, '..');
const repoRoot = resolve(docsRoot, '..', '..');
const skillsRoot = join(docsRoot, 'skills');
const curatedRouterSkill = join(repoRoot, 'skills', 'rune-langium', 'SKILL.md');
const generatedRouterSkill = join(skillsRoot, 'rune-langium', 'SKILL.md');

if (existsSync(curatedRouterSkill)) {
  cpSync(curatedRouterSkill, generatedRouterSkill);
}

for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    continue;
  }
  const skillPath = join(skillsRoot, entry.name, 'SKILL.md');
  if (!existsSync(skillPath)) {
    continue;
  }
  const content = readFileSync(skillPath, 'utf8').replaceAll(
    'references/classes/',
    'references/classes.md'
  );
  writeFileSync(skillPath, content);
}
