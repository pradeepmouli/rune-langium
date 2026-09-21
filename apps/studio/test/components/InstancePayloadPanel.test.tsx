// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InstancePayloadPanel } from '../../src/components/InstancePayloadPanel.js';

describe('InstancePayloadPanel', () => {
  it('renders one JSON value and delegates exporting to its owner', () => {
    const onExport = vi.fn();
    render(<InstancePayloadPanel payload={{ kind: 'instance', value: { name: 'Acme' } }} onExport={onExport} />);

    expect(screen.getByTestId('instance-payload-output')).toHaveTextContent('"Acme"');
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(onExport).toHaveBeenCalledOnce();
  });
});
