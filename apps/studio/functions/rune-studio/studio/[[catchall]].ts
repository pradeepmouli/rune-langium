// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Pages Function catch-all for the Rune Studio SPA.
 *
 * Problem: the `_redirects` rule
 *   `/rune-studio/studio/* /rune-studio/studio/index.html 200`
 * triggers CF Pages' infinite-loop detection (destination matches source
 * pattern) and is silently ignored, so deep-link reloads return 404.
 *
 * Solution: a catch-all function at `rune-studio/studio/[[catchall]]`
 * handles every request under `/rune-studio/studio/**`.
 *   1. Try to serve the request as a real static asset via `env.ASSETS`.
 *   2. If the asset doesn't exist (404), serve the SPA entry point
 *      (`/rune-studio/studio/index.html`) so client-side routing takes over.
 *
 * Asset requests (JS, CSS, WASM, fonts, images) all have cache-busted URLs
 * (Vite content hashes) and will be found on the first try.  HTML navigation
 * requests for client-routed paths (e.g. `/rune-studio/studio/structure/Trade`)
 * will 404 on the asset lookup and fall through to index.html.
 */
export const onRequest: PagesFunction<{ ASSETS: Fetcher }> = async ({ request, env }) => {
  // First: attempt to serve the real static asset.
  const assetResponse = await env.ASSETS.fetch(request);
  if (assetResponse.status !== 404) {
    return assetResponse;
  }

  // Asset not found — this is a SPA client-routed path. Serve index.html so
  // the React app can boot and the router can render the correct page.
  const indexUrl = new URL('/rune-studio/studio/index.html', request.url);
  return env.ASSETS.fetch(new Request(indexUrl.toString(), request));
};
