// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * @packageDocumentation
 *
 * Embed a Rune DSL language server behind a WebSocket or custom connection
 * adapter.
 *
 * @remarks
 * Use `createRuneLspServer()` when you need diagnostics, hover, completion, and
 * go-to-definition for `.rosetta` files in an editor or web app. Reach for
 * `createConnectionAdapter()` when tests or nonstandard transports need to plug
 * into the same server lifecycle.
 */

/**
 * @rune-langium/lsp-server — LSP server for Rune DSL powered by Langium
 * and @lspeasy/server.
 */

// Main server factory
export { createRuneLspServer } from './rune-dsl-server.js';
export type { RuneLspServer } from './rune-dsl-server.js';

// Connection adapter (for advanced / testing use)
export { createConnectionAdapter } from './connection-adapter.js';

// CF Durable Object transport — for embedding the LSP server inside a
// Workers DO with the CF Hibernation API. Use this when the WebSocket
// is delivered via the DO's webSocketMessage/Close hooks rather than
// browser-style addEventListener.
export { DurableObjectWebSocketTransport } from './cf-durable-object-transport.js';
