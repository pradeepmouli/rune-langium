// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { createContext, useContext } from 'react';
import type { LspClientService } from '../../services/lsp-client.js';
import type { TransportState } from '../../services/transport-provider.js';

export interface LspContextValue {
  lspClient: LspClientService | null;
  transportState: TransportState;
  reconnect: () => void;
}

export const LspContext = createContext<LspContextValue | null>(null);

export function useLsp(): LspContextValue {
  const ctx = useContext(LspContext);
  if (ctx === null) throw new Error('useLsp must be used within an LspProvider');
  return ctx;
}
