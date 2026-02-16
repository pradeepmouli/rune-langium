import '@testing-library/jest-dom/vitest';

// jsdom does not implement ResizeObserver — required by ReactFlow
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

// jsdom does not implement DOMMatrixReadOnly — required by ReactFlow
if (typeof globalThis.DOMMatrixReadOnly === 'undefined') {
  class DOMMatrixReadOnlyMock {
    m22: number;
    constructor() {
      this.m22 = 1;
    }
    get a() {
      return 1;
    }
    get b() {
      return 0;
    }
    get c() {
      return 0;
    }
    get d() {
      return 1;
    }
    get e() {
      return 0;
    }
    get f() {
      return 0;
    }
  }
  globalThis.DOMMatrixReadOnly = DOMMatrixReadOnlyMock as unknown as typeof DOMMatrixReadOnly;
}
