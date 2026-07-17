// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { execFileSync } from 'node:child_process';
import { checkout as test, expect } from '../fixtures.js';

const CF_PAGES_PROJECT = 'daikonic-dev';
const CF_PRODUCTION_BRANCH = 'master';

/**
 * Cloudflare Pages never rolls back on a failed build — canonical_deployment
 * is the last deployment that actually finished successfully, which can lag
 * latest_deployment (the most recent attempt) by any number of commits. A
 * "prod is current" check must read canonical_deployment, not branch HEAD or
 * the most recent deploy attempt.
 */
interface CfPagesDeployment {
  short_id: string;
  deployment_trigger: { metadata: { branch: string; commit_hash: string } };
  latest_stage: { status: string };
}

interface CfPagesProject {
  canonical_deployment?: CfPagesDeployment;
  latest_deployment?: CfPagesDeployment;
}

function resolveMasterCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', `origin/${CF_PRODUCTION_BRANCH}`], { encoding: 'utf-8' }).trim();
  } catch {
    return execFileSync('git', ['rev-parse', CF_PRODUCTION_BRANCH], { encoding: 'utf-8' }).trim();
  }
}

test.describe('J00 — deployment freshness', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');
  test.skip(
    !process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID,
    'set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to verify the live deployment against master'
  );

  test('J00a canonical Pages deployment serves the current master commit', async ({ request, evidence }) => {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const res = await request.get(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${CF_PAGES_PROJECT}`,
      { headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` } }
    );
    expect(res.ok(), `Cloudflare API request failed: ${res.status()} ${await res.text()}`).toBeTruthy();

    const { result } = (await res.json()) as { result: CfPagesProject };
    const canonical = result.canonical_deployment;
    expect(canonical, 'project has no canonical_deployment — nothing has ever deployed successfully').toBeTruthy();

    const masterCommit = resolveMasterCommit();
    const liveCommit = canonical!.deployment_trigger.metadata.commit_hash;

    if (liveCommit !== masterCommit) {
      const latest = result.latest_deployment;
      const staleness =
        latest && latest.short_id !== canonical!.short_id
          ? ` The most recent deploy attempt (${latest.deployment_trigger.metadata.commit_hash}) is in status ` +
            `"${latest.latest_stage.status}" — if it failed, production is silently stuck on an older commit.`
          : '';
      evidence.softFinding('deploy-staleness', `live=${liveCommit} master=${masterCommit}${staleness}`);
      expect(liveCommit, `Production (${liveCommit}) does not match master HEAD (${masterCommit}).${staleness}`).toBe(
        masterCommit
      );
    }
  });
});
