// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { createRequire } from 'node:module';
import { defineConfig, type Plugin } from 'vitest/config';

// TS 7's `typescript` package no longer exposes the classic Compiler API
// (`ts.transpileModule`, `ts.ScriptTarget`, ...) from its main entry —
// only `version`/`versionMajorMinor`. `typescript-classic` (pinned to TS
// 6.0.3, already a devDependency for the same reason elsewhere in this
// package) is the full API surface this transform needs.
const ts = createRequire(import.meta.url)('typescript-classic') as typeof import('typescript');

// This package's default TS transform (Vite 8's Oxc/rolldown pipeline —
// see rolldown's `transformSync`) does not lower native (TC39 Stage-3)
// method decorator syntax: it leaves `@debug()` etc. untouched in the
// output, assuming the runtime supports it natively. The Node version
// this repo runs on does not (no unflagged V8 support yet; `--js-decorators`
// exists but is non-functional in this Node build) — decorated files fail
// at test-run time with "SyntaxError: Invalid or unexpected token" even
// though `tsc -b` (the real production build) downlevels the exact same
// syntax correctly via its `__esDecorate`/`__runInitializers` helpers.
// This pre-transform runs `ts.transpileModule` (same target/decorator
// settings as tsconfig.json — no experimentalDecorators, so native TC39
// decorator downleveling) BEFORE Oxc sees the file, only for files that
// use this package's decorators — everything else is untouched.
const DECORATOR_USAGE_RE = /@(?:instrument|trace|debug|info|warn)\(/;

// Scoped exception to this plan's "do NOT build a live rolldown-vite/
// Rollup bundler AST-transform plugin" constraint (docs/superpowers/plans/
// 2026-08-01-instrumentation-wrapper.md, Global Constraints) — that
// constraint targets an auto-wrapping mechanism (discovering and injecting
// instrumentation into code that doesn't already call for it), which this
// is not. Every `@debug()` etc. site below is already hand-authored by a
// developer; this plugin's only job is a mechanical, test-time-only syntax
// downlevel — the identical transform `tsc -b` already performs for the
// real production build, which this plugin never touches. Reviewed and
// explicitly approved as a carve-out (not silently self-approved) during
// Task 9's review. Do NOT widen `DECORATOR_USAGE_RE` or generalize this
// plugin's role beyond "make already-explicit decorator syntax parseable
// under Oxc" — doing so would cross into the auto-wrapping territory the
// constraint exists to prevent, and needs the same explicit sign-off this
// carve-out got.
function decoratorLoweringPlugin(): Plugin {
  return {
    name: 'codegen-decorator-lowering',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('.ts') || !DECORATOR_USAGE_RE.test(code)) return null;
      const { outputText, sourceMapText } = ts.transpileModule(code, {
        fileName: id,
        compilerOptions: {
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.ESNext,
          sourceMap: true,
          verbatimModuleSyntax: true
        }
      });
      return { code: outputText, map: sourceMapText ? JSON.parse(sourceMapText) : null };
    }
  };
}

export default defineConfig({
  plugins: [decoratorLoweringPlugin()],
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**']
  }
});
