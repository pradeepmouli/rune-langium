// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  saveGlobalGithub, loadGlobalGithub, loadGlobalGithubToken, clearGlobalGithub, _resetGithubStoreForTests
} from '../../src/services/github-store.js';

beforeEach(async () => {
  await _resetGithubStoreForTests();
  await new Promise<void>((r) => { const req = indexedDB.deleteDatabase('rune-studio-github'); req.onsuccess = req.onerror = req.onblocked = () => r(); });
});

describe('github-store', () => {
  it('returns null when nothing is stored', async () => {
    expect(await loadGlobalGithub()).toBeNull();
    expect(await loadGlobalGithubToken()).toBeNull();
  });
  it('round-trips token + identity', async () => {
    await saveGlobalGithub('ghs_tok', { login: 'octocat', avatarUrl: 'https://x/y.png' });
    expect(await loadGlobalGithub()).toEqual({ token: 'ghs_tok', identity: { login: 'octocat', avatarUrl: 'https://x/y.png' } });
    expect(await loadGlobalGithubToken()).toBe('ghs_tok');
  });
  it('clears the connection', async () => {
    await saveGlobalGithub('ghs_tok', { login: 'octocat', avatarUrl: 'https://x/y.png' });
    await clearGlobalGithub();
    expect(await loadGlobalGithub()).toBeNull();
  });
});
