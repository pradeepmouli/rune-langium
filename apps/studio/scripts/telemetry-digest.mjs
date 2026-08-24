#!/usr/bin/env node
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Queries the telemetry Worker's structured console.log output via the
 * Cloudflare Workers Observability API and prints an event/rejection/span
 * digest.
 *
 *   pnpm --filter @rune-langium/studio run telemetry:digest [--since=2026-07-01] [--until=2026-07-31]
 *
 * Requires CLOUDFLARE_API_TOKEN (Workers Observability Read permission) and
 * CLOUDFLARE_ACCOUNT_ID — the same env var names already used by this
 * repo's other production-verification scripts/tests (see
 * apps/studio/test/prod-ux/journeys/j00-freshness.spec.ts,
 * apps/studio/test/prod-smoke/production-checkout.spec.ts,
 * scripts/upload-serialized-artifacts.sh) — NOT the CF-Access
 * client-id/secret pair the old custom `/v1/digest` endpoint needed. This
 * queries Cloudflare's own account API directly; the telemetry Worker no
 * longer exposes any digest/stats route at all (see
 * apps/telemetry-worker/src/index.ts, apps/telemetry-worker/wrangler.toml).
 */

const SERVICE_NAME = 'rune-telemetry-worker';
const DEFAULT_LOOKBACK_DAYS = 1;

function parseArgs(argv) {
  const sinceArg = argv.find((a) => a.startsWith('--since='));
  const untilArg = argv.find((a) => a.startsWith('--until='));
  const since = sinceArg
    ? sinceArg.slice('--since='.length)
    : (() => {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - DEFAULT_LOOKBACK_DAYS);
        return d.toISOString().slice(0, 10);
      })();
  const until = untilArg ? untilArg.slice('--until='.length) : new Date().toISOString().slice(0, 10);
  return { since, until };
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`telemetry:digest: missing required env var ${name}`);
    process.exitCode = 1;
    return null;
  }
  return value;
}

async function runQuery(accountId, apiToken, body) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/observability/telemetry/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }
  );
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(`Workers Observability query failed: HTTP ${res.status} — ${JSON.stringify(json.errors ?? json)}`);
  }
  return json.result;
}

function serviceFilter() {
  return { key: '$metadata.service', operation: 'eq', type: 'string', value: SERVICE_NAME };
}

async function main() {
  const accountId = requireEnv('CLOUDFLARE_ACCOUNT_ID');
  const apiToken = requireEnv('CLOUDFLARE_API_TOKEN');
  if (!accountId || !apiToken) return;

  const { since, until } = parseArgs(process.argv.slice(2));
  const timeframe = {
    from: Date.parse(`${since}T00:00:00.000Z`),
    to: Date.parse(`${until}T23:59:59.999Z`)
  };
  if (Number.isNaN(timeframe.from) || Number.isNaN(timeframe.to)) {
    console.error(`telemetry:digest: invalid --since/--until (got since=${since} until=${until})`);
    process.exitCode = 1;
    return;
  }

  // Query 1 — request-line summary: one row per (event, outcome,
  // error_category), daily time-series included. Covers accepted events,
  // rate_limited, and rejected (origin_not_allowed / schema_violation).
  const eventsResult = await runQuery(accountId, apiToken, {
    queryId: 'telemetry-digest-events',
    view: 'calculations',
    chart: true,
    granularity: 1440, // 1 bucket/day, in minutes
    timeframe,
    parameters: {
      filters: [serviceFilter(), { key: 'msg', operation: 'eq', type: 'string', value: 'telemetry.request' }],
      calculations: [{ operator: 'count' }],
      groupBys: [
        { type: 'string', value: 'event' },
        { type: 'string', value: 'outcome' },
        { type: 'string', value: 'error_category' }
      ],
      limit: 200
    }
  });

  // Query 2 — op_spans summary: one row per (op, level), with duration
  // percentiles. Signatures aren't grouped here (unbounded cardinality) —
  // use the Workers Observability dashboard's free-text search over
  // msg:"telemetry.span" for signature-level drill-down.
  const spansResult = await runQuery(accountId, apiToken, {
    queryId: 'telemetry-digest-spans',
    view: 'calculations',
    timeframe,
    parameters: {
      filters: [serviceFilter(), { key: 'msg', operation: 'eq', type: 'string', value: 'telemetry.span' }],
      calculations: [
        { operator: 'count' },
        { operator: 'p50', key: 'duration_ms', keyType: 'number', alias: 'p50_ms' },
        { operator: 'p95', key: 'duration_ms', keyType: 'number', alias: 'p95_ms' },
        { operator: 'p99', key: 'duration_ms', keyType: 'number', alias: 'p99_ms' }
      ],
      groupBys: [
        { type: 'string', value: 'op' },
        { type: 'string', value: 'level' }
      ],
      limit: 200
    }
  });

  console.log(
    JSON.stringify(
      {
        since,
        until,
        events: eventsResult,
        spans: spansResult
      },
      null,
      2
    )
  );
}

await main();
