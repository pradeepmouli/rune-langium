// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

const trustedBots = new Set(['dependabot', 'renovate', 'github-actions']);
const ciChecks = ['lint-and-test', 'check-generated', 'studio-a11y'];

export function classifyDependencyUpdate(pr) {
  const title = pr.title.toLowerCase();
  const labels = pr.labels.map((label) => label.name);
  return {
    isMajor: labels.includes('major') || title.includes('major'),
    isSecurity: labels.includes('security'),
    isDependency: labels.includes('dependencies')
  };
}

export function mergeReadiness(pr, expectedHead, repository) {
  if (pr.incompleteLabels) return 'incomplete labels';
  const policy = classifyDependencyUpdate(pr);
  if (pr.state !== 'OPEN' || pr.isDraft || pr.baseRefName !== 'master') return 'not an open master PR';
  if (!trustedBots.has(pr.author?.login?.replace(/\[bot\]$/, '')) || pr.author?.__typename !== 'Bot')
    return 'untrusted author';
  if (!policy.isDependency || policy.isMajor || policy.isSecurity) return 'manual-review update';
  if (pr.headRepository?.nameWithOwner !== repository || pr.headRefOid !== expectedHead)
    return 'different repository or head';
  if (pr.mergeStateStatus !== 'CLEAN') return 'GitHub merge checks not ready';
  if (!pr.reviews || pr.reviews.pageInfo.hasNextPage) return 'incomplete approval history';
  const latestReviews = new Map();
  for (const review of pr.reviews.nodes) {
    if (review.author && review.state !== 'COMMENTED' && review.state !== 'PENDING') {
      latestReviews.set(review.author.login, review.state);
    }
  }
  if ([...latestReviews.values()].includes('CHANGES_REQUESTED')) return 'changes requested';
  if (![...latestReviews.values()].includes('APPROVED')) return 'not approved';
  const contexts = pr.commits.nodes[0]?.commit.statusCheckRollup?.contexts;
  if (!contexts || contexts.pageInfo.hasNextPage) return 'incomplete check results';
  const passed = (check) =>
    check.__typename === 'StatusContext'
      ? check.state === 'SUCCESS'
      : check.status === 'COMPLETED' && ['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(check.conclusion);
  if (!contexts.nodes.every(passed)) return 'pending or failed checks';
  if (
    !ciChecks.every((name) =>
      contexts.nodes.some(
        (check) =>
          check.__typename === 'CheckRun' &&
          check.name === name &&
          check.checkSuite?.app?.slug === 'github-actions' &&
          check.conclusion === 'SUCCESS'
      )
    )
  )
    return 'missing successful CI gates';
  return undefined;
}

export async function finalizeDependencyUpdate({ github, context, core }) {
  const run = context.payload.workflow_run;
  if (!run || (run.event !== 'pull_request' && run.event !== 'pull_request_target')) return;
  const repository = `${context.repo.owner}/${context.repo.repo}`;
  if (run.head_repository?.full_name !== repository) return;
  const pulls = await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit, {
    ...context.repo,
    commit_sha: run.head_sha,
    per_page: 100
  });
  for (const pull of pulls) {
    const { repository: data } = await github.graphql(
      `
      query($owner: String!, $name: String!, $number: Int!) {
        repository(owner: $owner, name: $name) {
          pullRequest(number: $number) {
            state isDraft baseRefName headRefOid mergeStateStatus
            author { login __typename }
            headRepository { nameWithOwner }
            title labels(first: 100) { pageInfo { hasNextPage } nodes { name } }
            reviews(first: 100) { pageInfo { hasNextPage } nodes { author { login } state } }
            commits(last: 1) { nodes { commit {
              statusCheckRollup { contexts(first: 100) {
                pageInfo { hasNextPage }
                nodes {
                  __typename
                  ... on CheckRun { name status conclusion checkSuite { app { slug } } }
                  ... on StatusContext { state }
                }
              } }
            } } }
          }
        }
      }`,
      { owner: context.repo.owner, name: context.repo.repo, number: pull.number }
    );
    const pr = data.pullRequest;
    if (!pr) continue;
    pr.incompleteLabels = pr.labels.pageInfo.hasNextPage;
    pr.labels = pr.labels.nodes;
    const reason = mergeReadiness(pr, run.head_sha, repository);
    if (reason) {
      core.info(`PR #${pull.number}: waiting (${reason})`);
      continue;
    }
    // The normal merge API enforces branch rules and refuses a changed head.
    const { data: merged } = await github.rest.pulls.merge({
      ...context.repo,
      pull_number: pull.number,
      sha: run.head_sha,
      merge_method: 'merge'
    });
    if (!merged.merged) throw new Error(`PR #${pull.number}: ${merged.message}`);
    core.notice(`Merged dependency PR #${pull.number} after approval and successful CI`);
  }
}
