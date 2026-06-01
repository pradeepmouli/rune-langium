// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import z2fVite from '@zod-to-form/vite';
import { fileURLToPath } from 'url';
import type { Z2FViteConfig } from '@zod-to-form/vite';

/**
 * Force the build process to terminate once the bundle is written.
 *
 * rolldown-vite (the Vite 8 preview this studio runs on) intermittently
 * leaves an esbuild service process alive after a *successful* `vite build`,
 * so Node's event loop never drains and the process hangs forever. Under
 * `pnpm -r run build` this manifested as studio being the one package that
 * built (`✓ built in N s`) but never returned control to pnpm — running CI's
 * Build step to its 15-minute timeout (previously a 6-hour job ceiling). The
 * orphaned `esbuild` PID is killed at job cleanup, confirming the dangling
 * handle.
 *
 * `closeBundle` fires only after every chunk + sourcemap has been flushed to
 * `dist/`, so exiting here cannot truncate output. Restricted to
 * `apply: 'build'` and guarded against `--watch`, so dev/watch is untouched.
 * Deferred a tick so Vite's reporter summary flushes first.
 *
 * Crucially this must NOT mask a failed build: rolldown calls `closeBundle`
 * even on error (with an error argument), so we bail when one is present, and
 * we exit with the current `process.exitCode` rather than a hardcoded 0 so any
 * non-zero status set elsewhere still fails CI. On error we deliberately don't
 * force-exit — if the failed build then hangs, CI times out red, which is the
 * correct outcome (never a false green).
 */
function forceExitAfterBuild(): Plugin {
  let isWatch = false;
  return {
    name: 'studio:force-exit-after-build',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      isWatch = Boolean(config.build.watch);
    },
    closeBundle(error?: unknown) {
      if (isWatch || error) return;
      setTimeout(() => process.exit(process.exitCode ?? 0), 0);
    }
  };
}

export default defineConfig(({ command }) => {
  // Dev-only source aliases. The studio's `@rune-langium/visual-editor`
  // dependency resolves to its built `dist/` via the package `exports`, so
  // edits to `packages/visual-editor/src` don't hot-reload in `vite dev`
  // (unlike `@rune-langium/design-system`, whose exports already point at
  // `src`). Under `command === 'serve'` we alias the package to its source so
  // component + style edits HMR directly. Production `vite build`
  // (`command === 'build'`) is untouched and keeps consuming the package's
  // published `dist/`, so shipped bundles are unaffected.
  // Array form (not object) so the bare-package entry can be an anchored RegExp.
  // A string alias matches by prefix (`importee === find || startsWith(find + '/')`),
  // so a bare `@rune-langium/visual-editor` entry would greedily swallow subpath
  // imports like `@rune-langium/visual-editor/styles.css` and rewrite them to
  // `…/src/index.ts/styles.css` (unresolvable). The exact RegExp matches only the
  // bare specifier; `styles.css` gets its own explicit entry, listed first.
  const devSrcAliases =
    command === 'serve'
      ? [
          {
            find: '@rune-langium/visual-editor/styles.css',
            replacement: fileURLToPath(new URL('../../packages/visual-editor/src/styles.css', import.meta.url))
          },
          {
            find: /^@rune-langium\/visual-editor$/,
            replacement: fileURLToPath(new URL('../../packages/visual-editor/src/index.ts', import.meta.url))
          }
        ]
      : [];

  return {
    base: process.env.VITE_BASE_URL || (process.env.CF_PAGES === '1' ? '/rune-studio/studio/' : '/'),
    // Plugin order: z2fVite BEFORE react() per upstream's quickstart, so the
    // generated TSX flows through React's JSX transform normally.
    //
    // configOverride: inline z2f config avoids ssrLoadModule resolution of
    // @zod-to-form/core from the studio package, which isn't a direct dep.
    // The shadcn preset wires Checkbox (checked/onCheckedChange) and Select
    // (onValueChange) — matching the DS Radix primitives exactly.
    plugins: [
      z2fVite({
        configOverride: {
          components: {
            source: './src/codegen-forms/z2f-components',
            preset: 'shadcn'
          },
          defaults: {
            mode: 'auto-save',
            ui: 'shadcn'
          }
        } satisfies Z2FViteConfig
      }),
      tailwindcss(),
      react(),
      forceExitAfterBuild()
    ],
    optimizeDeps: {
      include: ['buffer']
    },
    // langium-zod's `dist/index.js` re-exports its CLI (`generate` from `cli.js`)
    // which runs `process.argv.slice(2)` at module-init. When vite optimises
    // the package the top-level CLI bytes execute in the browser and crash the
    // page with `process is not defined`. We're not running the CLI in-browser;
    // the smallest fix is to expose a no-op `process` shim so the CLI's
    // top-level guards short-circuit. This affects neither prod bundling nor
    // any code that actually wants Node's process at runtime.
    define: {
      'process.argv': '[]',
      'process.platform': '"browser"',
      'process.env': '{}',
      'process.exit': '(()=>{})',
      'process.cwd': '(()=>"/")',
      process: '({argv:[],platform:"browser",env:{},exit:()=>{},cwd:()=>"/"})'
    },
    resolve: {
      alias: [
        { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
        ...devSrcAliases
      ],
      dedupe: [
        'react',
        'react-dom',
        '@xyflow/react',
        '@radix-ui/react-compose-refs',
        '@radix-ui/react-primitive',
        '@radix-ui/react-slot'
      ]
    },
    server: {
      // Default 5173 (Vite convention, uncontested on macOS where AirPlay owns
      // :5000). `scripts/check-env.mjs` can pick a free fallback and export
      // STUDIO_DEV_PORT for both this config and playwright.config.ts.
      port: Number(process.env.STUDIO_DEV_PORT) || 5173,
      host: '0.0.0.0',
      allowedHosts: true
    },
    build: {
      target: 'es2020',
      outDir: 'dist',
      // e2e-batch fix #9: enable hidden sourcemaps for prod debuggability.
      // 'hidden' generates .map files but doesn't add the //# sourceMappingURL
      // comment in the bundle, so they aren't auto-fetched by browsers but ARE
      // available for symbolicating crash reports + opening via DevTools "Load
      // sourcemap" workflow. Previously prod TypeErrors (e.g. `at Dg
      // (index-_w0h5L6_.js:11247)`) were undebuggable.
      sourcemap: 'hidden'
    },
    worker: {
      format: 'es'
    }
  };
});
