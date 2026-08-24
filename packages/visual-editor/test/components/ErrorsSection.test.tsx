// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Unit tests for the shared ErrorsSection component (extracted from
 * OtherForm so the five covered-kind editor forms can also surface
 * `GraphNodeMeta.errors` — Codex review, PR #494).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorsSection } from '../../src/components/ErrorsSection.js';
import type { ValidationError } from '../../src/types.js';

describe('ErrorsSection', () => {
  it('renders nothing when errors is empty', () => {
    const { container } = render(<ErrorsSection errors={[]} />);
    expect(container.querySelector('[data-slot="errors-section"]')).toBeNull();
  });

  it('renders each error message with a count header when errors are present', () => {
    const errors: ValidationError[] = [
      { nodeId: 'n1', severity: 'error', message: 'Circular inheritance detected' },
      { nodeId: 'n1', severity: 'error', message: 'Missing required attribute' }
    ];
    render(<ErrorsSection errors={errors} />);

    expect(screen.getByText('Errors (2)')).toBeDefined();
    expect(screen.getByText('Circular inheritance detected')).toBeDefined();
    expect(screen.getByText('Missing required attribute')).toBeDefined();
  });
});
