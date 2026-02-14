/**
 * @rune-langium/lsp-server — LSP server for Rune DSL powered by Langium
 * and @lspeasy/server.
 */

// Main server factory
export { createRuneLspServer } from './rune-dsl-server.js';
export type { RuneLspServer } from './rune-dsl-server.js';

// Connection adapter (for advanced / testing use)
export { createConnectionAdapter } from './connection-adapter.js';
