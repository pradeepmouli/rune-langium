// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { createContext, useContext } from 'react';
import type { LspClientService } from '../../services/lsp-client.js';
import type { TransportState } from '../../services/transport-provider.js';
import { withInstrumentation } from '../../services/instrumentation/core.js';

export interface LspContextValue {
  lspClient: LspClientService | null;
  /**
   * Connection FSM. Optional so consumers can guard on its presence (the
   * connection badge renders only once a transport state exists); LspProvider
   * always supplies one in production.
   */
  transportState?: TransportState;
  reconnect: () => void;
}

export const LspContext = createContext<LspContextValue | null>(null);

export const useLsp = withInstrumentation(
  function useLsp(): LspContextValue {
    const ctx = useContext(LspContext);
    if (ctx === null) throw new Error('useLsp must be used within an LspProvider');
    return ctx;
  },
  { op: 'useLsp' }
);
