// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { createContext, useContext } from 'react';
import type { GitHubIdentity } from '../../services/github-store.js';
import type { GitHubAuthErrorCategory } from '../../services/github-auth.js';

export type { GitHubIdentity };
export type { GitHubAuthErrorCategory };
export interface GitHubContextValue {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  user?: GitHubIdentity;
  deviceFlow?: { userCode: string; verificationUri: string };
  error?: string;
  /** Structured error category from the github-auth Worker (present when status==='error'). */
  errorCategory?: GitHubAuthErrorCategory;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
export const GitHubContext = createContext<GitHubContextValue | null>(null);
export function useGitHub(): GitHubContextValue {
  const ctx = useContext(GitHubContext);
  if (ctx === null) throw new Error('useGitHub must be used within a GitHubProvider');
  return ctx;
}
