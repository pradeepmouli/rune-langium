// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { NodeKindBadge } from '../../../src/components/nodes/NodeKindBadge.js';

describe('NodeKindBadge (delegates to canonical KindBadge)', () => {
  it('renders the canonical full label for the kind', () => {
    render(<NodeKindBadge kind="data" />);
    expect(screen.getByText('Data')).toBeInTheDocument();
  });

  it('applies the canonical label-pill chrome (rune-node-kind-badge + uppercase + token variant)', () => {
    const { container } = render(<NodeKindBadge kind="enum" />);
    expect(container.querySelector('.rune-node-kind-badge')).not.toBeNull();
    expect(container.querySelector('.uppercase')).not.toBeNull();
    expect(container.querySelector('.text-enum')).not.toBeNull();
  });

  it('forwards className', () => {
    const { container } = render(<NodeKindBadge kind="func" className="my-extra" />);
    expect(container.querySelector('.my-extra')).not.toBeNull();
  });
});
