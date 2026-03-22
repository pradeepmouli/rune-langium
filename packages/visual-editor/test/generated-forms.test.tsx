// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { RosettaEnumerationForm } from '../src/components/forms/generated/RosettaEnumerationForm.js';

describe('RosettaEnumerationForm', () => {
  it('renders without errors with a mock onValueChange prop', () => {
    const onValueChange = vi.fn();
    expect(() =>
      render(
        <RosettaEnumerationForm
          onValueChange={onValueChange}
          defaultValues={{ $type: 'RosettaEnumeration', name: '' }}
        />
      )
    ).not.toThrow();
  });

  it('renders a name input field', () => {
    const onValueChange = vi.fn();
    const { getByLabelText } = render(
      <RosettaEnumerationForm
        onValueChange={onValueChange}
        defaultValues={{ $type: 'RosettaEnumeration', name: 'TestEnum' }}
      />
    );
    expect(getByLabelText(/name/i)).toBeDefined();
  });
});
