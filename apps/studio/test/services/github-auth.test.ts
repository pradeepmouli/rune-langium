// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T053 — github-auth client tests.
 * Asserts the device-init / poll-with-backoff cycle and the OPFS token
 * stash. Token is scoped to the workspace; revocation = delete the file.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createOpfsRoot } from '../setup/opfs-mock.js';
import { OpfsFs } from '../../src/opfs/opfs-fs.js';
import {
  initDeviceFlow,
  pollDeviceFlow,
  storeWorkspaceToken,
  loadWorkspaceToken,
  deleteWorkspaceToken
} from '../../src/services/github-auth.js';

const AUTH_BASE = 'https://www.daikonic.dev/rune-studio/api/github-auth';

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => fetchSpy.mockRestore());

describe('initDeviceFlow (T053)', () => {
  it('returns the user-code + verification URI on success', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          device_code: 'devcode',
          user_code: 'WXYZ-1234',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 5
        }),
        { status: 200 }
      )
    );
    const result = await initDeviceFlow(AUTH_BASE);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.userCode).toBe('WXYZ-1234');
      expect(result.deviceCode).toBe('devcode');
    }
  });

  it('surfaces github_unavailable on a 503', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'github_unavailable' }), { status: 503 })
    );
    const result = await initDeviceFlow(AUTH_BASE);
    expect(result.kind).toBe('error');
  });
});

describe('pollDeviceFlow (T053)', () => {
  it('returns the access token on 200', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'gho_xxx', token_type: 'bearer' }), {
        status: 200
      })
    );
    const result = await pollDeviceFlow(AUTH_BASE, 'devcode');
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') expect(result.accessToken).toBe('gho_xxx');
  });

  it('returns pending on 202', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'authorization_pending' }), { status: 202 })
    );
    const result = await pollDeviceFlow(AUTH_BASE, 'devcode');
    expect(result.kind).toBe('pending');
  });

  it('returns expired on 410', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 410 }));
    const result = await pollDeviceFlow(AUTH_BASE, 'devcode');
    expect(result.kind).toBe('expired');
  });
});

describe('storeWorkspaceToken / loadWorkspaceToken (T053)', () => {
  it('round-trips the token via OPFS, scoped per workspace', async () => {
    const root = createOpfsRoot();
    const fs = new OpfsFs(root as unknown as FileSystemDirectoryHandle);
    await storeWorkspaceToken(fs, 'ws-1', 'gho_secret');
    expect(await loadWorkspaceToken(fs, 'ws-1')).toBe('gho_secret');
    expect(await loadWorkspaceToken(fs, 'ws-other')).toBeNull();
  });

  it('deleteWorkspaceToken removes the stored token', async () => {
    const root = createOpfsRoot();
    const fs = new OpfsFs(root as unknown as FileSystemDirectoryHandle);
    await storeWorkspaceToken(fs, 'ws-1', 'gho_secret');
    await deleteWorkspaceToken(fs, 'ws-1');
    expect(await loadWorkspaceToken(fs, 'ws-1')).toBeNull();
  });
});
