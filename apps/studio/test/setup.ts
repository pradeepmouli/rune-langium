// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import '@testing-library/jest-dom/vitest';

// jsdom does not implement ResizeObserver — provide a no-op stub so components
// that use it (e.g. the graph auto-orientation effect) don't throw in tests.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
