// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { usePerspectiveStore } from '../src/store/perspective-store.js';

// vitest's jsdom build does not expose Web Storage (`window.localStorage` is
// undefined), so App-level tests that render <App> — which reads
// `window.localStorage` for the theme at App.tsx:530 — throw
// "Cannot read properties of undefined (reading 'getItem')". Provide a minimal
// in-memory Storage polyfill on both `window` and `globalThis`.
if (typeof globalThis.localStorage === 'undefined') {
  class MemoryStorage implements Storage {
    private store = new Map<string, string>();
    get length(): number {
      return this.store.size;
    }
    clear(): void {
      this.store.clear();
    }
    getItem(key: string): string | null {
      return this.store.has(key) ? this.store.get(key)! : null;
    }
    key(index: number): string | null {
      return [...this.store.keys()][index] ?? null;
    }
    removeItem(key: string): void {
      this.store.delete(key);
    }
    setItem(key: string, value: string): void {
      this.store.set(key, String(value));
    }
  }
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', { value: local, configurable: true });
    Object.defineProperty(window, 'sessionStorage', { value: session, configurable: true });
  }
}

// zustand stores are process-global singletons shared across test files within
// a worker. PerspectiveHost / EditorPage tests deliberately set
// activePerspective to 'explore'; without a reset that state leaks into
// App-rendering test files (App-restore, App-curated-*, App-restore-cleanup)
// and hides the Workspaces launcher. Reset to the store default after every
// test so each test file starts from a clean perspective.
afterEach(() => {
  usePerspectiveStore.setState({ activePerspective: 'workspaces' });
});

// jsdom does not implement ResizeObserver — provide a no-op stub so components
// that use it (e.g. the graph auto-orientation effect) don't throw in tests.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom does not implement Pointer Capture or scrollIntoView, both of which
// Radix UI primitives (Select, Popover, etc.) call during user interactions.
// Polyfill the methods on Element so component tests don't throw.
if (typeof Element !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}
