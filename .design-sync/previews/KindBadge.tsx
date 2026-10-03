// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { KindBadge } from '@rune-langium/design-system';

// J06 structure view / J05 inspector: the kind pill on graph nodes and the inspector header.
export const Labels = () => (
  <div className="flex flex-wrap items-center gap-2">
    <KindBadge kind="data" />
    <KindBadge kind="choice" />
    <KindBadge kind="enum" />
    <KindBadge kind="func" />
    <KindBadge kind="typeAlias" />
    <KindBadge kind="basicType" />
    <KindBadge kind="annotation" />
  </div>
);

// J04 explorer hydration: compact letter glyphs in dense namespace-tree rows.
export const TreeGlyphs = () => (
  <ul className="flex w-[280px] flex-col gap-1 rounded-md border border-border bg-sidebar p-2 text-sm text-foreground">
    {(
      [
        ['data', 'Party'],
        ['data', 'TradeState'],
        ['choice', 'PayerReceiver'],
        ['enum', 'BusinessDayConventionEnum'],
        ['func', 'Create_TradeState']
      ] as const
    ).map(([kind, name]) => (
      <li key={name} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-accent">
        <KindBadge kind={kind} shape="glyph" />
        <span className="truncate">{name}</span>
      </li>
    ))}
  </ul>
);
