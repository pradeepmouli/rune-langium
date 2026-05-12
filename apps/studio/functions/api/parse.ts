// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Cloudflare Pages Function: POST /api/parse
 *
 * Server-side `parseWorkspace`. Browser studio POSTs workspace files;
 * function runs Langium parse + builds the index, returns a hydration
 * blob the browser worker can replay locally so subsequent linkDocument
 * requests work without re-parsing.
 *
 * Task 0.3 ships a 501 stub; Task 0.4 wires the real pipeline.
 */

export const onRequestPost: PagesFunction = async () => {
  return new Response(JSON.stringify({ ok: false, error: 'Not implemented yet' }), {
    status: 501,
    headers: { 'Content-Type': 'application/json' }
  });
};
