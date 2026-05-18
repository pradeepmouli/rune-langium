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
 *   2. If the asset doesn't exist (404) AND the request is a navigation
 *      (browser document load), serve the SPA entry point so React Router
 *      can take over. Real missing-asset 404s (JS / CSS / fonts requested
 *      with Accept: \*\/\* or Sec-Fetch-Dest: script|style|font|image)
 *      pass through unchanged — turning them into HTML would surface as
 *      "Unexpected token <" in the browser console.
 *
 * Asset requests are cache-busted by Vite's content hashes and resolve on
 * the first try. HTML navigation requests for client-routed paths (e.g.
 * `/rune-studio/studio/structure/Trade`) 404 on the asset lookup and fall
 * through to the SPA entry.
 */

/** True if the request is a top-level browser navigation (document load). */
function isNavigationRequest(request: Request): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  // Modern browsers set Sec-Fetch-Dest: document on top-level navigations.
  // Fall back to Accept: text/html for older clients (and curl with -H accept).
  const dest = request.headers.get('sec-fetch-dest');
  if (dest === 'document') return true;
  if (dest && dest !== 'document') return false; // explicit non-document (script, style, image, font, etc.)
  const accept = request.headers.get('accept') ?? '';
  return accept.includes('text/html');
}

export const onRequest: PagesFunction<{ ASSETS: Fetcher }> = async ({ request, env }) => {
  // First: attempt to serve the real static asset.
  const assetResponse = await env.ASSETS.fetch(request);
  if (assetResponse.status !== 404) {
    return assetResponse;
  }

  // Asset not found. If this isn't a browser navigation (script/style/font/
  // image/fetch/XHR), preserve the 404 — rewriting to HTML would cause the
  // browser to try parsing `<html>...` as JS/CSS and fail with cryptic errors.
  if (!isNavigationRequest(request)) {
    return assetResponse;
  }

  // Navigation 404 -> serve the SPA entry so client-side routing can render.
  // Use the PRETTY URL /rune-studio/studio/ (trailing slash, no index.html)
  // because CF Pages' asset server resolves index assets only via the pretty
  // path; asking for /rune-studio/studio/index.html directly can itself 404.
  // A fresh GET Request (no original headers/body) avoids body-consumption
  // issues with non-GET methods reaching this fallback path.
  const indexUrl = new URL('/rune-studio/studio/', request.url);
  return env.ASSETS.fetch(new Request(indexUrl.toString(), { method: 'GET' }));
};
