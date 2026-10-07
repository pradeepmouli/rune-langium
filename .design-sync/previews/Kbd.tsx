// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { Kbd } from '@rune-langium/design-system';

// J05 / command palette: shortcut hint in a trigger.
export const PaletteTrigger = () => (
  <div className="flex w-[320px] items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
    <span>Search types and commands…</span>
    <span className="flex gap-1">
      <Kbd>⌘</Kbd>
      <Kbd>K</Kbd>
    </span>
  </div>
);

// J07 source-lsp: editor shortcut list.
export const ShortcutList = () => (
  <ul className="flex w-[320px] flex-col gap-2 text-sm text-foreground">
    <li className="flex items-center justify-between">
      Go to definition <Kbd>F12</Kbd>
    </li>
    <li className="flex items-center justify-between">
      Rename symbol <Kbd>F2</Kbd>
    </li>
    <li className="flex items-center justify-between">
      Save workspace{' '}
      <span className="flex gap-1">
        <Kbd>⌘</Kbd>
        <Kbd>S</Kbd>
      </span>
    </li>
    <li className="flex items-center justify-between">
      Toggle Source{' '}
      <span className="flex gap-1">
        <Kbd>⌘</Kbd>
        <Kbd>⇧</Kbd>
        <Kbd>E</Kbd>
      </span>
    </li>
  </ul>
);

// Inline hint in prose.
export const InlineHint = () => (
  <p className="text-sm text-muted-foreground">
    Press <Kbd>Esc</Kbd> to close the inspector or <Kbd>Enter</Kbd> to confirm the rename.
  </p>
);
