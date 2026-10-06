// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyDependencyUpdate, finalizeDependencyUpdate, mergeReadiness } from './dependency-automerge.mjs';

const repository = 'pradeepmouli/rune-langium';
const sha = 'current-head';
function ready() {
  return {
    title: 'chore(deps): bump vite',
    labels: [{ name: 'dependencies' }],
    state: 'OPEN',
    isDraft: false,
    baseRefName: 'master',
    mergeStateStatus: 'CLEAN',
    headRefOid: sha,
    headRepository: { nameWithOwner: repository },
    author: { login: 'dependabot', __typename: 'Bot' },
    reviews: { pageInfo: { hasNextPage: false }, nodes: [{ author: { login: 'github-actions' }, state: 'APPROVED' }] },
    commits: {
      nodes: [
        {
          commit: {
            statusCheckRollup: {
              contexts: {
                pageInfo: { hasNextPage: false },
                nodes: ['lint-and-test', 'check-generated', 'studio-a11y'].map((name) => ({
                  __typename: 'CheckRun',
                  name,
                  status: 'COMPLETED',
                  conclusion: 'SUCCESS',
                  checkSuite: { app: { slug: 'github-actions' } }
                }))
              }
            }
          }
        }
      ]
    }
  };
}

test('unchanged dependency policy keeps major/security updates manual', () => {
  for (const pr of [
    { title: 'major version', labels: [] },
    { title: 'upgrade', labels: [{ name: 'major' }] }
  ]) {
    assert.equal(classifyDependencyUpdate(pr).isMajor, true);
  }
  assert.equal(classifyDependencyUpdate({ title: 'patch', labels: [{ name: 'security' }] }).isSecurity, true);
});

test('current approved bot head with all CI gates is ready', () => {
  assert.equal(mergeReadiness(ready(), sha, repository), undefined);
});

for (const [name, mutate] of [
  [
    'stale head',
    (pr) => {
      pr.headRefOid = 'new-head';
    }
  ],
  [
    'fork',
    (pr) => {
      pr.headRepository.nameWithOwner = 'other/fork';
    }
  ],
  [
    'human author',
    (pr) => {
      pr.author.__typename = 'User';
    }
  ],
  [
    'untrusted bot',
    (pr) => {
      pr.author.login = 'other-bot';
    }
  ],
  [
    'major label',
    (pr) => {
      pr.labels.push({ name: 'major' });
    }
  ],
  [
    'security update',
    (pr) => {
      pr.labels.push({ name: 'security' });
    }
  ],
  [
    'missing dependency label',
    (pr) => {
      pr.labels = [];
    }
  ],
  [
    'closed PR',
    (pr) => {
      pr.state = 'CLOSED';
    }
  ],
  [
    'draft PR',
    (pr) => {
      pr.isDraft = true;
    }
  ],
  [
    'other base',
    (pr) => {
      pr.baseRefName = 'release';
    }
  ],
  [
    'unstable GitHub state',
    (pr) => {
      pr.mergeStateStatus = 'UNSTABLE';
    }
  ],
  [
    'missing approval',
    (pr) => {
      pr.reviews.nodes = [];
    }
  ],
  [
    'dismissed approval',
    (pr) => {
      pr.reviews.nodes.push({ author: { login: 'github-actions' }, state: 'DISMISSED' });
    }
  ],
  [
    'changes requested',
    (pr) => {
      pr.reviews.nodes.push({ author: { login: 'reviewer' }, state: 'CHANGES_REQUESTED' });
    }
  ],
  [
    'truncated labels',
    (pr) => {
      pr.incompleteLabels = true;
    }
  ],
  [
    'truncated reviews',
    (pr) => {
      pr.reviews.pageInfo.hasNextPage = true;
    }
  ],
  [
    'truncated checks',
    (pr) => {
      pr.commits.nodes[0].commit.statusCheckRollup.contexts.pageInfo.hasNextPage = true;
    }
  ],
  [
    'missing check rollup',
    (pr) => {
      pr.commits.nodes[0].commit.statusCheckRollup = null;
    }
  ],
  [
    'pending CI',
    (pr) => {
      pr.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[0].status = 'IN_PROGRESS';
    }
  ],
  [
    'failed CI',
    (pr) => {
      pr.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[0].conclusion = 'FAILURE';
    }
  ],
  [
    'skipped mandatory gate',
    (pr) => {
      pr.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[0].conclusion = 'SKIPPED';
    }
  ],
  [
    'missing mandatory gate',
    (pr) => {
      pr.commits.nodes[0].commit.statusCheckRollup.contexts.nodes.pop();
    }
  ],
  [
    'forged CI app',
    (pr) => {
      pr.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[0].checkSuite.app.slug = 'other';
    }
  ],
  [
    'failed extra status',
    (pr) => {
      pr.commits.nodes[0].commit.statusCheckRollup.contexts.nodes.push({
        __typename: 'StatusContext',
        state: 'FAILURE'
      });
    }
  ]
]) {
  test(`refuses ${name}`, () => {
    const pr = ready();
    mutate(pr);
    assert.notEqual(mergeReadiness(pr, sha, repository), undefined);
  });
}

test('comment-only reviews do not erase approval', () => {
  const pr = ready();
  pr.reviews.nodes.push({ author: { login: 'github-actions' }, state: 'COMMENTED' });
  assert.equal(mergeReadiness(pr, sha, repository), undefined);
});

function harness(pr = ready()) {
  const merges = [];
  const context = {
    repo: { owner: 'pradeepmouli', repo: 'rune-langium' },
    payload: {
      workflow_run: { event: 'pull_request', head_sha: sha, head_repository: { full_name: repository } }
    }
  };
  const github = {
    paginate: async () => [{ number: 551 }],
    graphql: async () => ({
      repository: { pullRequest: { ...pr, labels: { pageInfo: { hasNextPage: false }, nodes: pr.labels } } }
    }),
    rest: {
      repos: { listPullRequestsAssociatedWithCommit() {} },
      pulls: {
        merge: async (args) => {
          merges.push(args);
          return { data: { merged: true } };
        }
      }
    }
  };
  return { github, context, core: { info() {}, notice() {} }, merges };
}

test('finalizer merges only the checked head through the normal API', async () => {
  const h = harness();
  await finalizeDependencyUpdate(h);
  assert.deepEqual(h.merges, [
    { owner: 'pradeepmouli', repo: 'rune-langium', pull_number: 551, sha, merge_method: 'merge' }
  ]);
});

test('stale completion does not merge a newer commit', async () => {
  const pr = ready();
  pr.headRefOid = 'new-head';
  const h = harness(pr);
  await finalizeDependencyUpdate(h);
  assert.deepEqual(h.merges, []);
});

test('push and fork completion events do not fetch or merge PRs', async () => {
  for (const change of [
    (run) => {
      run.event = 'push';
    },
    (run) => {
      run.head_repository.full_name = 'other/fork';
    }
  ]) {
    const h = harness();
    change(h.context.payload.workflow_run);
    h.github.paginate = () => {
      throw new Error('must not read PRs');
    };
    await finalizeDependencyUpdate(h);
    assert.deepEqual(h.merges, []);
  }
});

test('API and merge failures are not silently deferred', async () => {
  const h = harness();
  h.github.graphql = async () => {
    throw new Error('permission denied');
  };
  await assert.rejects(finalizeDependencyUpdate(h), /permission denied/);
  const rejected = harness();
  rejected.github.rest.pulls.merge = async () => ({ data: { merged: false, message: 'head changed' } });
  await assert.rejects(finalizeDependencyUpdate(rejected), /head changed/);
});
