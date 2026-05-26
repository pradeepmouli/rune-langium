// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  saveGlobalGitHub, loadGlobalGitHub, loadGlobalGitHubToken, clearGlobalGitHub, _resetGitHubStoreForTests
} from '../../src/services/github-store.js';

beforeEach(async () => {
  await _resetGitHubStoreForTests();
  await new Promise<void>((r) => { const req = indexedDB.deleteDatabase('rune-studio-github'); req.onsuccess = req.onerror = req.onblocked = () => r(); });
});

describe('github-store', () => {
  it('returns null when nothing is stored', async () => {
    expect(await loadGlobalGitHub()).toBeNull();
    expect(await loadGlobalGitHubToken()).toBeNull();
  });
  it('round-trips token + identity', async () => {
    await saveGlobalGitHub('ghs_tok', { login: 'octocat', avatarUrl: 'https://x/y.png' });
    expect(await loadGlobalGitHub()).toEqual({ token: 'ghs_tok', identity: { login: 'octocat', avatarUrl: 'https://x/y.png' } });
    expect(await loadGlobalGitHubToken()).toBe('ghs_tok');
  });
  it('clears the connection', async () => {
    await saveGlobalGitHub('ghs_tok', { login: 'octocat', avatarUrl: 'https://x/y.png' });
    await clearGlobalGitHub();
    expect(await loadGlobalGitHub()).toBeNull();
  });
});
