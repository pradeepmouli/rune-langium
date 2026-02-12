#!/usr/bin/env node
/**
 * CLI entry point — starts a WebSocket-based Rune DSL LSP server.
 *
 * Usage:
 *   rune-lsp-server [--port <port>] [--host <host>]
 *
 * Defaults: port 3001, host 0.0.0.0
 */

import { WebSocketServer } from 'ws';
import { WebSocketTransport } from '@lspeasy/core';
import { createRuneLspServer } from './rune-dsl-server.js';

const DEFAULT_PORT = 3001;
const DEFAULT_HOST = '0.0.0.0';

function parseArgs(): { port: number; host: string } {
  const args = process.argv.slice(2);
  let port = DEFAULT_PORT;
  let host = DEFAULT_HOST;

  for (let i = 0; i < args.length; i++) {
    const next = args[i + 1];
    if (args[i] === '--port' && next) {
      port = parseInt(next, 10);
      i++;
    } else if (args[i] === '--host' && next) {
      host = next;
      i++;
    }
  }

  return { port, host };
}

async function main(): Promise<void> {
  const { port, host } = parseArgs();

  const wss = new WebSocketServer({ port, host });
  console.log(`Rune DSL LSP Server listening on ws://${host}:${port}`);

  wss.on('connection', async (ws) => {
    console.log('Client connected');

    // Each WebSocket connection gets its own LSP server instance
    const lsp = createRuneLspServer();

    // Create a WebSocketTransport from the raw WebSocket
    const transport = new WebSocketTransport(ws as any);

    // Bind and start processing messages
    await lsp.listen(transport);

    ws.on('close', () => {
      console.log('Client disconnected');
    });
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\nShutting down...');
    wss.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start LSP server:', err);
  process.exit(1);
});
