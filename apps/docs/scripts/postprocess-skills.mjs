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

if (existsSync(curatedRouterSkill) && existsSync(generatedRouterSkill)) {
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
  const skillDir = join(skillsRoot, entry.name);
  let content = readFileSync(skillPath, 'utf8');

  content = rewriteReferenceLink(content, skillDir, 'functions');
  content = rewriteReferenceLink(content, skillDir, 'classes');

  writeFileSync(skillPath, content);
}

function rewriteReferenceLink(content, skillDir, section) {
  const markdownRef = `references/${section}.md`;
  const directoryRef = `references/${section}/`;
  const hasMarkdownRef = existsSync(join(skillDir, markdownRef));
  const preferredRef = hasMarkdownRef ? markdownRef : directoryRef;
  const alternateRef = hasMarkdownRef ? directoryRef : markdownRef;
  return content.replaceAll(alternateRef, preferredRef);
}
