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

  it('does not render a submit button (auto-save, no submit)', () => {
    const onValueChange = vi.fn();
    const { queryByRole } = render(<RosettaEnumerationForm onValueChange={onValueChange} />);

    // No submit button present — auto-save is wired via onValueChange
    const submitButton = queryByRole('button', { name: /submit/i });
    expect(submitButton).toBeNull();
  });

  it('renders a standard <input> for the name (unmapped) field', () => {
    const onValueChange = vi.fn();
    const { getByLabelText } = render(<RosettaEnumerationForm onValueChange={onValueChange} />);

    const nameInput = getByLabelText(/name/i);
    expect(nameInput.tagName).toBe('INPUT');
  });
});
