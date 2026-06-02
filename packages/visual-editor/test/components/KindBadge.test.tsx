// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { KindBadge, KIND_LABEL, KIND_LETTER } from '../../src/components/KindBadge.js';

describe('KindBadge', () => {
  it('renders the label shape with the kind label text', () => {
    render(<KindBadge kind="data" />);
    expect(screen.getByText('Data')).toBeInTheDocument();
  });

  it('renders the glyph shape with the single-letter classifier', () => {
    render(<KindBadge kind="choice" shape="glyph" />);
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('renders the label shape uppercase (matches graph/structure-view look)', () => {
    const { container } = render(<KindBadge kind="data" />);
    expect(container.querySelector('.uppercase')).not.toBeNull();
  });

  it('applies the token-backed kind variant class (one color source)', () => {
    const { container } = render(<KindBadge kind="enum" />);
    expect(container.querySelector('.text-enum')).not.toBeNull();
  });

  it('exposes one canonical label + letter map for all TypeKinds', () => {
    expect(KIND_LABEL.func).toBe('Function');
    expect(KIND_LETTER.func).toBe('F');
  });
});
