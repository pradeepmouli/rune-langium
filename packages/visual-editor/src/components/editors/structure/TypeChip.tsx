// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import * as React from 'react';
import { cn } from '@rune-langium/design-system/utils';

export type TypeChipKind = 'Data' | 'Choice' | 'Enum' | 'BasicType' | 'Record' | 'TypeAlias' | 'Unresolved';

/** Structure-view kind → chip color-variant class. The canonical type-as-chip idiom. */
export const TYPE_CHIP_KIND_CLASS: Record<TypeChipKind, string> = {
  Data: 'rune-cell-type-chip--data',
  Choice: 'rune-cell-type-chip--choice',
  Enum: 'rune-cell-type-chip--enum',
  BasicType: 'rune-cell-type-chip--basic',
  Record: 'rune-cell-type-chip--record',
  TypeAlias: 'rune-cell-type-chip--typealias',
  Unresolved: 'rune-cell-type-chip--unresolved'
};

export interface TypeChipProps extends React.ComponentProps<'button'> {
  typeName: string;
  typeKind: TypeChipKind;
}

/** Presentational type chip (the .rune-cell-type-chip look). No drag-drop /
 * no dropdown — callers compose those around it. Forwards its ref so it can be
 * used as a base-ui Popover/Trigger `render` element (the inspector type field). */
export const TypeChip = React.forwardRef<HTMLButtonElement, TypeChipProps>(function TypeChip(
  { typeName, typeKind, className, ...props },
  ref
): React.ReactElement {
  return (
    <button
      ref={ref}
      type="button"
      data-slot="type-chip"
      className={cn('rune-cell-type-chip', TYPE_CHIP_KIND_CLASS[typeKind], className)}
      {...props}
    >
      {typeName}
    </button>
  );
});
