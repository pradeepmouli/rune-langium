#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
//
// Test client for the lsp-spike Worker (T035).
//
// Connects to ws://localhost:8788/spike/ws (default), waits for the
// `spike/ready` banner with the sample source, sends `initialize` then
// `textDocument/didOpen`, then waits up to 30s for the first
// `textDocument/publishDiagnostics`. Prints the diagnostics shape to stdout
// and exits 0 on success, 1 on any failure.

import { WebSocket } from 'ws';

const url = process.argv[2] ?? 'ws://localhost:8788/spike/ws';
const TIMEOUT_MS = 30_000;

const ws = new WebSocket(url);

let nextId = 1;
function send(method, params) {
  const msg = { jsonrpc: '2.0', id: nextId++, method, params };
  ws.send(JSON.stringify(msg));
  return msg.id;
}
function notify(method, params) {
  ws.send(JSON.stringify({ jsonrpc: '2.0', method, params }));
}

let sample = null;
let sampleUri = null;
let initializeId = null;
let timer = setTimeout(() => {
  console.error(`[FAIL] No publishDiagnostics within ${TIMEOUT_MS}ms`);
  process.exit(1);
}, TIMEOUT_MS);

ws.on('open', () => {
  console.log('[ws] open');
});

ws.on('error', (err) => {
  console.error(`[FAIL] ws error: ${err?.message ?? err}`);
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.error(`[ws] close ${code} ${reason?.toString?.() ?? ''}`);
});

ws.on('message', (data) => {
  let msg;
  try {
    msg = JSON.parse(data.toString('utf8'));
  } catch (err) {
    console.error(`[FAIL] non-JSON frame: ${data}`);
    process.exit(1);
  }

  // ── Spike-only banners ──
  if (msg.method === 'spike/ready') {
    sample = msg.params.sample;
    sampleUri = msg.params.sampleUri;
    console.log(`[spike] ready — sample length=${sample.length}, uri=${sampleUri}`);

    initializeId = send('initialize', {
      processId: null,
      rootUri: null,
      capabilities: {
        textDocument: {
          publishDiagnostics: {},
          synchronization: { dynamicRegistration: false }
        }
      },
      workspaceFolders: null
    });
    return;
  }
  if (msg.method === 'spike/error' || msg.method === 'spike/warn') {
    console.error(`[spike ${msg.method}] ${JSON.stringify(msg.params)}`);
    if (msg.method === 'spike/error') process.exit(1);
    return;
  }

  // ── LSP responses ──
  if (msg.id === initializeId && msg.result) {
    console.log('[lsp] initialize result keys:', Object.keys(msg.result));
    if (msg.result.capabilities) {
      console.log('[lsp] server capabilities (subset):', {
        textDocumentSync: msg.result.capabilities.textDocumentSync,
        hoverProvider: msg.result.capabilities.hoverProvider,
        completionProvider: !!msg.result.capabilities.completionProvider,
        definitionProvider: msg.result.capabilities.definitionProvider
      });
    }

    notify('initialized', {});
    notify('textDocument/didOpen', {
      textDocument: {
        uri: sampleUri,
        languageId: 'rune-dsl',
        version: 1,
        text: sample
      }
    });
    return;
  }

  // ── The thing we're after ──
  if (msg.method === 'textDocument/publishDiagnostics') {
    clearTimeout(timer);
    const params = msg.params ?? {};
    const diagnostics = params.diagnostics ?? [];
    console.log('[PASS] publishDiagnostics received');
    console.log(`  uri: ${params.uri}`);
    console.log(`  count: ${diagnostics.length}`);
    if (diagnostics[0]) {
      const d = diagnostics[0];
      console.log('  first diagnostic shape:', {
        range: d.range,
        severity: d.severity,
        message: d.message?.slice?.(0, 120),
        source: d.source,
        code: d.code
      });
    } else {
      console.log('  (no diagnostics — clean parse)');
    }

    // Best-effort shutdown
    try {
      send('shutdown', null);
      notify('exit', null);
    } catch {
      /* ignore */
    }
    setTimeout(() => process.exit(0), 200);
    return;
  }

  // Anything else — log briefly
  console.log(`[lsp] ${msg.method ?? 'response#' + msg.id}: ${JSON.stringify(msg).slice(0, 160)}`);
});
