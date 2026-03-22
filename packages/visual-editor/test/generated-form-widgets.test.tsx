// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { RosettaEnumerationForm } from '../src/components/forms/generated/RosettaEnumerationForm.js';
import type { TypeOption } from '../src/types.js';

describe('RosettaEnumerationForm widget resolution (SC-001, FR-011)', () => {
  it('renders TypeSelector for the parent cross-ref field (not a plain <input>)', () => {
    const onValueChange = vi.fn();
    const typeOptions: TypeOption[] = [{ value: 'FooEnum', label: 'FooEnum', kind: 'enum' }];

    const { container } = render(
      <RosettaEnumerationForm onValueChange={onValueChange} typeOptions={typeOptions} />
    );

    // TypeSelector renders a SelectTrigger with data-slot="type-selector"
    const typeSelector = container.querySelector('[data-slot="type-selector"]');
    expect(typeSelector).not.toBeNull();
  });

  it('renders an auto-save form (no submit button, uses onValueChange)', () => {
    const onValueChange = vi.fn();
    const { container, queryByRole } = render(
      <RosettaEnumerationForm onValueChange={onValueChange} />
    );

    // z2f auto-save mode uses watch + onValueChange — no submit button
    const submitButton = queryByRole('button', { name: /submit/i });
    expect(submitButton).toBeNull();

    // Should render a <form> element
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
  });

  it('renders a standard <input> for the name (unmapped) field', () => {
    const onValueChange = vi.fn();
    const { getByLabelText } = render(<RosettaEnumerationForm onValueChange={onValueChange} />);

    const nameInput = getByLabelText(/name/i);
    expect(nameInput.tagName).toBe('INPUT');
  });
});
