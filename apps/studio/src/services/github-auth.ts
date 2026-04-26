// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * GitHub Device-Flow client. Talks to the github-auth-worker mediator
 * (never directly to GitHub) and stashes the resulting token in OPFS,
 * scoped per workspace. Deleting the workspace deletes the token.
 */

import type { OpfsFs } from '../opfs/opfs-fs.js';

/**
 * Categorised init/poll error reasons. The github-auth Worker classifies
 * upstream failures into structured categories
 * (`contracts/github-auth-worker.md`); we surface those so the dialog
 * can render distinct user-facing copy (FR-006 / EC-6) instead of a
 * raw "HTTP 502" string.
 */
export type GitHubAuthErrorCategory =
  | 'misconfigured' // 502: GitHub App client_id is the placeholder, not deployed yet
  | 'unavailable' // 503 / network: GitHub upstream unhealthy
  | 'origin_blocked' // 403: Origin not in the Worker's allowlist
  | 'unknown';

export type InitResult =
  | {
      kind: 'ok';
      deviceCode: string;
      userCode: string;
      verificationUri: string;
      intervalSec: number;
      expiresInSec: number;
    }
  | { kind: 'error'; reason: string; category: GitHubAuthErrorCategory };

export type PollResult =
  | { kind: 'ok'; accessToken: string; scope: string }
  | { kind: 'pending' }
  | { kind: 'slow_down' }
  | { kind: 'expired' }
  | { kind: 'access_denied' }
  | { kind: 'error'; reason: string; category: GitHubAuthErrorCategory };

function categoriseStatus(status: number): GitHubAuthErrorCategory {
  if (status === 502) return 'misconfigured';
  if (status === 503) return 'unavailable';
  if (status === 403) return 'origin_blocked';
  return 'unknown';
}

export async function initDeviceFlow(authBase: string): Promise<InitResult> {
  let res: Response;
  try {
    res = await fetch(`${authBase}/device-init`, {
      method: 'POST',
      credentials: 'include'
    });
  } catch (err) {
    return { kind: 'error', reason: (err as Error).message, category: 'unavailable' };
  }
  if (!res.ok) {
    return {
      kind: 'error',
      reason: `HTTP ${res.status}`,
      category: categoriseStatus(res.status)
    };
  }
  const body = (await res.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  };
  return {
    kind: 'ok',
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUri: body.verification_uri,
    intervalSec: body.interval,
    expiresInSec: body.expires_in
  };
}

export async function pollDeviceFlow(authBase: string, deviceCode: string): Promise<PollResult> {
  let res: Response;
  try {
    res = await fetch(`${authBase}/device-poll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ device_code: deviceCode })
    });
  } catch (err) {
    return { kind: 'error', reason: (err as Error).message, category: 'unavailable' };
  }
  if (res.status === 200) {
    const body = (await res.json()) as { access_token: string; scope?: string };
    return { kind: 'ok', accessToken: body.access_token, scope: body.scope ?? '' };
  }
  if (res.status === 202) {
    const body = (await res.json()) as { status?: string };
    return body.status === 'slow_down' ? { kind: 'slow_down' } : { kind: 'pending' };
  }
  if (res.status === 410) return { kind: 'expired' };
  // The Worker returns 403 access_denied (terminal — user clicked Cancel)
  // distinct from the catch-all error path. Mirror that semantic so the
  // dialog can render distinct copy.
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (body.error === 'access_denied') return { kind: 'access_denied' };
  }
  return {
    kind: 'error',
    reason: `HTTP ${res.status}`,
    category: categoriseStatus(res.status)
  };
}

// ---------- token storage (per workspace, OPFS only) ----------

const TOKEN_PATH = '.studio/token';

export async function storeWorkspaceToken(
  fs: OpfsFs,
  workspaceId: string,
  token: string
): Promise<void> {
  await fs.writeFile(`/${workspaceId}/${TOKEN_PATH}`, token);
}

export async function loadWorkspaceToken(fs: OpfsFs, workspaceId: string): Promise<string | null> {
  try {
    const v = await fs.readFile(`/${workspaceId}/${TOKEN_PATH}`, 'utf8');
    return typeof v === 'string' ? v : new TextDecoder().decode(v);
  } catch {
    return null;
  }
}

export async function deleteWorkspaceToken(fs: OpfsFs, workspaceId: string): Promise<void> {
  try {
    await fs.unlink(`/${workspaceId}/${TOKEN_PATH}`);
  } catch {
    /* already gone */
  }
}
