// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * One-time codemod: finds top-level `export function` declarations not
 * already wrapped in withInstrumentation, and rewrites them to call it,
 * defaulting `op` to the function's own name. Run once per target glob,
 * result is ordinary committed source — NOT a live build-time transform
 * (see docs/superpowers/specs/2026-08-01-instrumentation-wrapper-design.md's
 * "Wiring mechanism" for why a rolldown-vite bundler plugin was rejected).
 *
 * Usage: pnpm --filter @rune-langium/studio exec tsx scripts/instrument-codemod.ts "src/services/*.ts"
 */
import path from 'node:path';
import { Project } from 'ts-morph';

// cwd is apps/studio when invoked via `pnpm --filter @rune-langium/studio exec`
// (and when vitest runs the test below) — every path here is relative to the
// PACKAGE root, not the repo root.
const CORE_MODULE = path.resolve('src/services/instrumentation/core.ts');

function relativeImportPathFor(fileDir: string): string {
  // Computed per-file so every rewritten file imports withInstrumentation
  // via a correct relative path regardless of its depth under src/ (or
  // functions/ — the same expression yields `../../src/...` from there).
  let rel = path.relative(fileDir, CORE_MODULE).replace(/\.ts$/, '.js');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

export function runCodemod(globPattern: string): void {
  // skipAddingFilesFromTsConfig is load-bearing: without it the Project
  // pre-loads EVERY file in the studio tsconfig, and iterating the project's
  // source files would rewrite the whole package on any invocation instead
  // of just the glob. Iterate ONLY the files the glob added, for the same
  // reason.
  const project = new Project({ tsConfigFilePath: 'tsconfig.json', skipAddingFilesFromTsConfig: true });
  const sourceFiles = project.addSourceFilesAtPaths(globPattern);
  for (const sourceFile of sourceFiles) {
    if (sourceFile.getFullText().includes('@instrumentation-codemod-applied')) continue; // idempotency marker
    const fns = sourceFile.getFunctions().filter((fn) => fn.isExported() && fn.getName());
    if (fns.length === 0) continue;
    const importPath = relativeImportPathFor(sourceFile.getDirectoryPath());
    for (const fn of fns) {
      const name = fn.getName()!;
      const isAsync = fn.isAsync();
      const typeParamsText = fn
        .getTypeParameters()
        .map((p) => p.getText())
        .join(', ');
      const paramsText = fn
        .getParameters()
        .map((p) => p.getText())
        .join(', ');
      const returnTypeText = fn.getReturnTypeNode()?.getText() ?? '';
      const bodyText = fn.getBodyText() ?? '';
      const fnText = `${isAsync ? 'async ' : ''}function ${name}${typeParamsText ? `<${typeParamsText}>` : ''}(${paramsText})${returnTypeText ? `: ${returnTypeText}` : ''} {\n${bodyText}\n}`;
      fn.replaceWithText(
        `export const ${name} = withInstrumentation(${fnText}, { op: '${name}', sanitize: () => '[unsanitized-default: REVIEW]', sanitizeError: (e) => ({ signature: e instanceof Error ? e.name : 'Error' }) });`
      );
    }
    sourceFile.addImportDeclaration({ moduleSpecifier: importPath, namedImports: ['withInstrumentation'] });
    sourceFile.insertText(0, '// @instrumentation-codemod-applied\n');
  }
  project.saveSync();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const glob = process.argv[2];
  if (!glob) {
    console.error('Usage: tsx instrument-codemod.ts <glob>');
    process.exit(1);
  }
  runCodemod(glob);
}
