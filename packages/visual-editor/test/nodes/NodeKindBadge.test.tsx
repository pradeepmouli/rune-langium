// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NodeKindBadge } from '../../src/components/nodes/NodeKindBadge.js';

describe('NodeKindBadge', () => {
  it('renders the compact graph label styling used by both graph nodes and inspector', () => {
    render(<NodeKindBadge kind="typeAlias" />);

    const badge = screen.getByText('Alias');
    expect(badge.className).toContain('rune-node-kind-badge');
    expect(badge.className).toContain('rune-kind-badge--typeAlias');
  });
});
