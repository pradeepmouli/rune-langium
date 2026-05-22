// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { usePerspectiveStore } from '../src/store/perspective-store.js';

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
