// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T085 — cross-app design-system primitives.
 * Exercises the new shared components from a Studio consumer; they're
 * pure React + Tailwind so a single set of tests covers all three
 * surfaces (landing, docs, Studio) that consume them.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Heading } from '@rune-langium/design-system/ui/heading';
import { CodeBlock } from '@rune-langium/design-system/ui/code-block';
import { AppSwitcher } from '@rune-langium/design-system/ui/app-switcher';

describe('Heading (T085)', () => {
  it('renders the requested semantic level', () => {
    render(<Heading level={1}>Title</Heading>);
    expect(screen.getByRole('heading', { level: 1, name: /Title/ })).toBeInTheDocument();
  });

  it('preserves semantic level when `as` overrides the visual size', () => {
    render(
      <Heading level={1} as="h2">
        Section
      </Heading>
    );
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });

  it('applies token-driven size classes per level', () => {
    const { container } = render(<Heading level={1}>x</Heading>);
    expect(container.firstElementChild?.className).toMatch(/text-3xl/);
  });
});

describe('CodeBlock (T085)', () => {
  it('renders a <pre><code> structure', () => {
    render(<CodeBlock>const x = 1;</CodeBlock>);
    const pre = screen.getByText(/const x = 1;/).closest('pre');
    expect(pre).toBeInTheDocument();
  });

  it('exposes the language as a data attribute', () => {
    const { container } = render(<CodeBlock language="typescript">x</CodeBlock>);
    expect(container.querySelector('pre')?.getAttribute('data-language')).toBe('typescript');
  });
});

describe('AppSwitcher (T085, T092)', () => {
  it('renders three navigation links', () => {
    render(<AppSwitcher current="studio" />);
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('marks the current surface with aria-current=page', () => {
    render(<AppSwitcher current="studio" />);
    const links = screen.getAllByRole('link');
    const studio = links.find((l) => l.textContent === 'Studio');
    const home = links.find((l) => l.textContent === 'Home');
    expect(studio?.getAttribute('aria-current')).toBe('page');
    expect(home?.getAttribute('aria-current')).toBeNull();
  });

  it('respects URL overrides for staging deployments', () => {
    render(<AppSwitcher current="studio" urls={{ home: 'https://staging.daikonic.dev/' }} />);
    const home = screen.getAllByRole('link').find((l) => l.textContent === 'Home');
    expect(home?.getAttribute('href')).toBe('https://staging.daikonic.dev/');
  });

  it('exposes role=navigation with an accessible name', () => {
    render(<AppSwitcher current="studio" />);
    expect(screen.getByRole('navigation', { name: /rune-langium surfaces/i })).toBeInTheDocument();
  });
});
