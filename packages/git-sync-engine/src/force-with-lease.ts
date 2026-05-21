// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { GitOps } from './git-ops.js';

export type LeaseResult = { ok: true } | { ok: false; reason: 'lease_failed' };

/** Emulates `git push --force-with-lease`: only force-push if the remote ref
 *  still equals `expectedRemoteSha` after a fresh fetch. */
export async function pushForceWithLease(
  ops: GitOps,
  ref: string,
  remoteUrl: string,
  expectedRemoteSha: string | null
): Promise<LeaseResult> {
  await ops.fetch(ref, remoteUrl);
  const current = await ops.remoteSha(ref);
  if (current !== expectedRemoteSha) return { ok: false, reason: 'lease_failed' };
  await ops.push(ref, remoteUrl, { force: true });
  return { ok: true };
}
