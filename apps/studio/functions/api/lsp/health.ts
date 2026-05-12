// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * GET /api/lsp/health — reachability + langium-load probe.
 *
 * Extracted from apps/lsp-worker/src/index.ts (handleHealth).
 * Runs as a Cloudflare Pages Function on the studio deployment.
 *
 * The original worker probes langium at module-eval time (eager import).
 * In this Pages Function we probe lazily on each request because Pages
 * Functions don't have a shared module-level initialization scope with
 * the same lifetime guarantees as a Cloudflare Worker isolate.
 */

const WORKER_VERSION = '0.1.0';

let langiumLoaded: boolean | null = null;
let langiumLoadError: string | null = null;

/**
 * Attempt to import @rune-langium/lsp-server once and cache the result.
 * Subsequent calls return the cached outcome to avoid re-probing on every
 * health request.
 */
async function probeLangium(): Promise<{ loaded: boolean; error: string | null }> {
  if (langiumLoaded !== null) {
    return { loaded: langiumLoaded, error: langiumLoadError };
  }
  try {
    const { createRuneLspServer } = await import('@rune-langium/lsp-server');
    if (typeof createRuneLspServer !== 'function') {
      throw new TypeError('createRuneLspServer is not a function');
    }
    langiumLoaded = true;
    langiumLoadError = null;
  } catch (err) {
    langiumLoaded = false;
    langiumLoadError = err instanceof Error ? err.message : String(err);
  }
  return { loaded: langiumLoaded, error: langiumLoadError };
}

const startupMs = Date.now();

export const onRequestGet: PagesFunction = async () => {
  const { loaded, error } = await probeLangium();
  return new Response(
    JSON.stringify({
      ok: loaded,
      version: WORKER_VERSION,
      langium_loaded: loaded,
      ...(error ? { load_error: error } : {}),
      uptime_seconds: Math.max(0, Math.floor((Date.now() - startupMs) / 1000))
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
};
