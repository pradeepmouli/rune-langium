// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InspectorPanel } from '../../src/shell/panels/InspectorPanel.js';

describe('InspectorPanel', () => {
  it('renders the empty state without a duplicate in-panel Inspector heading', () => {
    render(<InspectorPanel />);

    expect(screen.getByTestId('panel-inspector')).toHaveTextContent(
      'Select a node in the editor or visual preview to inspect it.'
    );
    expect(screen.queryByRole('heading', { name: 'Inspector' })).not.toBeInTheDocument();
  });
});
