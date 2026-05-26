// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { createContext, useContext } from 'react';
import type { GithubIdentity } from '../../services/github-store.js';

export type { GithubIdentity };
export interface GithubContextValue {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  user?: GithubIdentity;
  deviceFlow?: { userCode: string; verificationUri: string };
  error?: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
export const GithubContext = createContext<GithubContextValue | null>(null);
export function useGithub(): GithubContextValue {
  const ctx = useContext(GithubContext);
  if (ctx === null) throw new Error('useGithub must be used within a GithubProvider');
  return ctx;
}
