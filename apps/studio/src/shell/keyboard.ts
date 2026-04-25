// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Keyboard shortcut layer. The dockview keyboard contract
 * (specs/012-studio-workspace-ux/contracts/dockview-panel-registry.md) is
 * implemented here as a single dispatch table so every panel sees the
 * same bindings without each having to register its own listener.
 */

export type ShellAction =
  | 'focus-next-panel'
  | 'focus-prev-panel'
  | 'shrink-panel'
  | 'grow-panel'
  | 'toggle-panel-collapse'
  | 'reorder-tab-left'
  | 'reorder-tab-right'
  | 'close-tab'
  | 'reset-layout';

interface KeyBinding {
  /** Key as reported by KeyboardEvent.key (lowercased for letters). */
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

/**
 * Two bindings per action — mac (`metaKey`) + non-mac (`ctrlKey`). Both
 * are checked on every keydown; we don't try to detect the platform.
 */
const BINDINGS: Record<ShellAction, KeyBinding[]> = {
  'focus-next-panel': [
    { key: 'ArrowRight', ctrlKey: true, altKey: true },
    { key: 'ArrowRight', metaKey: true, altKey: true }
  ],
  'focus-prev-panel': [
    { key: 'ArrowLeft', ctrlKey: true, altKey: true },
    { key: 'ArrowLeft', metaKey: true, altKey: true }
  ],
  'shrink-panel': [
    { key: '-', ctrlKey: true, altKey: true },
    { key: '-', metaKey: true, altKey: true }
  ],
  'grow-panel': [
    { key: '=', ctrlKey: true, altKey: true },
    { key: '=', metaKey: true, altKey: true }
  ],
  'toggle-panel-collapse': [
    { key: 'b', ctrlKey: true, altKey: true },
    { key: 'b', metaKey: true, altKey: true }
  ],
  'reorder-tab-left': [{ key: 'ArrowLeft', altKey: true, shiftKey: true }],
  'reorder-tab-right': [{ key: 'ArrowRight', altKey: true, shiftKey: true }],
  'close-tab': [
    { key: 'w', ctrlKey: true },
    { key: 'w', metaKey: true }
  ],
  'reset-layout': [] // command palette only — no global shortcut
};

export function matchAction(ev: KeyboardEvent): ShellAction | null {
  for (const action in BINDINGS) {
    const a = action as ShellAction;
    for (const b of BINDINGS[a]) {
      if (
        normalizeKey(ev.key) === normalizeKey(b.key) &&
        Boolean(ev.ctrlKey) === Boolean(b.ctrlKey) &&
        Boolean(ev.metaKey) === Boolean(b.metaKey) &&
        Boolean(ev.altKey) === Boolean(b.altKey) &&
        Boolean(ev.shiftKey) === Boolean(b.shiftKey)
      ) {
        return a;
      }
    }
  }
  return null;
}

function normalizeKey(k: string): string {
  return k.length === 1 ? k.toLowerCase() : k;
}

export type ShellHandler = (action: ShellAction, ev: KeyboardEvent) => void;

/**
 * Install a global keydown listener that dispatches matched shortcuts to
 * `handler`. Returns a teardown function — call from a useEffect cleanup.
 */
export function installShellShortcuts(
  target: Window | HTMLElement,
  handler: ShellHandler
): () => void {
  const listener = (ev: Event) => {
    const ke = ev as KeyboardEvent;
    const action = matchAction(ke);
    if (action) {
      ke.preventDefault();
      handler(action, ke);
    }
  };
  target.addEventListener('keydown', listener);
  return () => target.removeEventListener('keydown', listener);
}
