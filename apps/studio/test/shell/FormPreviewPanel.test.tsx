// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormPreviewPanel } from '../../src/shell/panels/FormPreviewPanel.js';
import { usePreviewStore } from '../../src/store/preview-store.js';

describe('Shell FormPreviewPanel', () => {
  beforeEach(() => {
    usePreviewStore.getState().resetPreviewState();
  });

  it('renders the selected target form without raw source metadata', () => {
    usePreviewStore.getState().setAvailableTargets([
      {
        id: 'preview.alpha.Trade',
        namespace: 'preview.alpha',
        name: 'Trade',
        kind: 'data'
      }
    ]);
    usePreviewStore.getState().selectTarget('preview.alpha.Trade');
    usePreviewStore.getState().receivePreviewResult({
      schemaVersion: 1,
      targetId: 'preview.alpha.Trade',
      title: 'Trade',
      status: 'ready',
      fields: [
        {
          path: 'tradeId',
          label: 'Trade id',
          kind: 'string',
          required: true
        }
      ],
      sourceMap: [
        {
          fieldPath: 'tradeId',
          sourceUri: 'file:///workspace/preview-alpha.rosetta',
          sourceLine: 7,
          sourceChar: 2
        }
      ]
    });

    render(<FormPreviewPanel />);

    expect(screen.getByText('Trade')).toBeInTheDocument();
    expect(screen.getByLabelText('Trade id')).toBeInTheDocument();
    expect(screen.queryByText(/preview-alpha\.rosetta:7:2/i)).not.toBeInTheDocument();
  });
});
