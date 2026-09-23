// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { createContext, useContext } from 'react';
import type { PreviewSessionClient } from '../../services/preview-session-client.js';
import { withInstrumentation } from '../../services/instrumentation/core.js';

export type PreviewSessionFactory = () => PreviewSessionClient;
export const PreviewSessionContext = createContext<PreviewSessionFactory | null>(null);
export const usePreviewSessionFactory = withInstrumentation(
  function usePreviewSessionFactory(): PreviewSessionFactory | null {
    return useContext(PreviewSessionContext);
  },
  { op: 'usePreviewSessionFactory' }
);
