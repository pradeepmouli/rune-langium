// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { ComponentProps, ReactNode } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TypeOption } from '../../src/types.js';
import { TYPE_REF_PAYLOAD_MIME, typeRefMimeForKind } from '../../src/types/structure-view.js';
import type { TypeRefPayload } from '../../src/types/structure-view.js';

vi.mock('@rune-langium/design-system/ui/badge', () => ({
  badgeVariants: () => 'badge'
}));

vi.mock('@rune-langium/design-system/ui/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div data-testid="select-root">{children}</div>,
  SelectContent: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div data-testid="select-content" className={className}>
      {children}
    </div>
  ),
  SelectGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <div data-testid={`select-item-${value}`}>{children}</div>
  ),
  SelectLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, className, ...props }: ComponentProps<'button'>) => (
    <button type="button" className={className} {...props}>
      {children}
    </button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>
}));

import { TypeSelector } from '../../src/components/editors/TypeSelector.js';

const OPTIONS: TypeOption[] = [
  { value: 'builtin::string', label: 'string', kind: 'builtin' },
  { value: 'test.ns::Trade', label: 'Trade', kind: 'data', namespace: 'test.ns' }
];

describe('TypeSelector', () => {
  // ---------------------------------------------------------------------------
  // P2 review (PR #210): filterKinds with no draggable analog must REJECT all
  // drops, not silently widen the accept policy to every kind. Previously the
  // mapping returned `mapped.length > 0 ? mapped : all`, so a selector
  // configured to only accept e.g. `builtin` / `func` / `typeAlias` (none of
  // which exist in TypeRefPayload['kind']) would accept Data / Choice / Enum
  // / BasicType drops anyway.
  // ---------------------------------------------------------------------------

  function buildDataTransfer(payload: TypeRefPayload): { dataTransfer: DataTransfer; preventedDefault: boolean } {
    const store = new Map<string, string>();
    store.set(TYPE_REF_PAYLOAD_MIME, JSON.stringify(payload));
    store.set(typeRefMimeForKind(payload.kind), '');
    const dt = {
      types: Array.from(store.keys()),
      getData: (mime: string) => store.get(mime) ?? '',
      setData: () => {},
      dropEffect: '' as DataTransfer['dropEffect'],
      effectAllowed: 'link' as DataTransfer['effectAllowed']
    } as unknown as DataTransfer;
    return { dataTransfer: dt, preventedDefault: false };
  }

  it('filterKinds specifying only non-draggable kinds rejects type-ref drops', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <TypeSelector
        value={null}
        options={OPTIONS}
        onSelect={onSelect}
        // None of these map to a TypeRefPayload['kind'] — drop must be rejected.
        filterKinds={['builtin', 'func', 'typeAlias']}
      />
    );

    const dropTarget = container.querySelector('[data-type-selector-drop="true"]');
    expect(dropTarget).toBeTruthy();

    const dataPayload: TypeRefPayload = {
      rune: 'type-ref',
      namespaceUri: 'test.ns',
      typeId: 'test.ns::Trade',
      typeName: 'Trade',
      kind: 'Data'
    };
    const { dataTransfer } = buildDataTransfer(dataPayload);

    act(() => {
      fireEvent.drop(dropTarget!, { dataTransfer });
    });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('filterKinds with a draggable kind still accepts matching drops', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <TypeSelector value={null} options={OPTIONS} onSelect={onSelect} filterKinds={['data']} />
    );

    const dropTarget = container.querySelector('[data-type-selector-drop="true"]');
    expect(dropTarget).toBeTruthy();

    const dataPayload: TypeRefPayload = {
      rune: 'type-ref',
      namespaceUri: 'test.ns',
      typeId: 'test.ns::Trade',
      typeName: 'Trade',
      kind: 'Data'
    };
    const { dataTransfer } = buildDataTransfer(dataPayload);

    act(() => {
      fireEvent.drop(dropTarget!, { dataTransfer });
    });

    expect(onSelect).toHaveBeenCalledWith('test.ns::Trade');
  });

  it('omitting filterKinds (no filter) accepts any draggable kind', () => {
    const onSelect = vi.fn();
    const { container } = render(<TypeSelector value={null} options={OPTIONS} onSelect={onSelect} />);

    const dropTarget = container.querySelector('[data-type-selector-drop="true"]');
    expect(dropTarget).toBeTruthy();

    const enumPayload: TypeRefPayload = {
      rune: 'type-ref',
      namespaceUri: 'test.ns',
      typeId: 'test.ns::Side',
      typeName: 'Side',
      kind: 'Enum'
    };
    const { dataTransfer } = buildDataTransfer(enumPayload);

    act(() => {
      fireEvent.drop(dropTarget!, { dataTransfer });
    });

    expect(onSelect).toHaveBeenCalledWith('test.ns::Side');
  });
});
