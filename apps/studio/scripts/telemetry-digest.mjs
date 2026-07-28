#!/usr/bin/env node
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Fetches the fleet telemetry digest (GET /v1/digest) and prints it.
 *
 *   pnpm --filter @rune-langium/studio run telemetry:digest [--since=2026-07-01]
 *
 * /v1/digest is CF-Access-gated at the route (same as /v1/stats — see
 * apps/telemetry-worker/src/index.ts's own comment; nothing to check
 * Worker-side). No existing script in this repo authenticates to a
 * CF-Access-protected route yet (verify-production.sh only probes public
 * endpoints), so this uses Cloudflare's own documented service-token
 * header convention (CF-Access-Client-Id / CF-Access-Client-Secret) rather
 * than inventing a repo-specific one. Omit both env vars when running
 * against a local `wrangler dev` instance with no Access policy attached.
 */

const DEFAULT_LOOKBACK_DAYS = 1;

function parseArgs(argv) {
  const sinceArg = argv.find((a) => a.startsWith('--since='));
  if (sinceArg) return { since: sinceArg.slice('--since='.length) };
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - DEFAULT_LOOKBACK_DAYS);
  return { since: d.toISOString().slice(0, 10) };
}

async function main() {
  const { since } = parseArgs(process.argv.slice(2));
  const base = process.env.TELEMETRY_DIGEST_ENDPOINT ?? 'https://www.daikonic.dev/rune-studio/api/telemetry/v1/digest';
  const url = `${base}?since=${encodeURIComponent(since)}`;

  const headers = {};
  if (process.env.CF_ACCESS_CLIENT_ID) headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
  if (process.env.CF_ACCESS_CLIENT_SECRET) headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error(`telemetry:digest failed: HTTP ${res.status} from ${url}`);
    process.exitCode = 1;
    return;
  }
  const body = await res.json();
  console.log(JSON.stringify(body, null, 2));
}

await main();
