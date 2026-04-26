// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
//
// Throwaway feasibility spike (T035, feature 014-studio-prod-ready).
//
// Goal: prove langium + @lspeasy/server can boot inside a Cloudflare Worker
// isolate with `nodejs_compat`, parse a `.rosetta` source, and emit a
// publishDiagnostics over a CF-WebSocketPair to a connecting test client.
//
// PASS = full round-trip works.
// FAIL = any step (langium import, service container construction, parse,
// WS upgrade, message emission) throws — record exact error.
//
// NOT production code. Hard-coded fixture, no auth, no retries.

/// <reference types="@cloudflare/workers-types" />

import { WebSocketTransport } from '@lspeasy/core';
import { createRuneLspServer } from '@rune-langium/lsp-server';

// ─── eager-load probe ────────────────────────────────────────────────────────
// Touch the imports at module-eval time so /spike/health knows whether
// langium loaded at all, BEFORE any request comes in. If this throws,
// the worker fails to instantiate (visible in `wrangler dev` stderr).
let LANGIUM_LOADED = false;
let LANGIUM_LOAD_ERROR: string | null = null;
try {
  // Just referencing the imported function is enough — if the module
  // graph couldn't resolve, we'd never reach this line. We don't *call*
  // createRuneLspServer here because that allocates the langium service
  // container, which we want to do per-request inside the WS handler so
  // failures surface cleanly per-request rather than at isolate startup.
  if (typeof createRuneLspServer !== 'function') {
    throw new Error('createRuneLspServer is not a function');
  }
  LANGIUM_LOADED = true;
} catch (err) {
  LANGIUM_LOAD_ERROR = err instanceof Error ? err.message : String(err);
}

const STARTUP_TIME = Date.now();

// Minimal valid Rune DSL source — adapted from the cdm-tiny.tar.gz fixture
// (apps/studio/test/fixtures/curated/cdm-tiny.tar.gz → sample.rosetta).
// Kept inline to make the spike self-contained.
const SAMPLE_ROSETTA = `namespace cdm.sample : <"Sample CDM namespace for spike.">
version "0.1.0"

type Trade:
  tradeId string (1..1)
  tradeDate date (1..1)

type Party:
  name string (1..1)
`;

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // ── Health probe ──────────────────────────────────────────────────────
    if (url.pathname === '/spike/health' && request.method === 'GET') {
      return Response.json({
        ok: true,
        langium_loaded: LANGIUM_LOADED,
        load_error: LANGIUM_LOAD_ERROR,
        uptime_ms: Date.now() - STARTUP_TIME
      });
    }

    // ── WebSocket upgrade ─────────────────────────────────────────────────
    if (url.pathname === '/spike/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      // Critical: accept() before attaching listeners so messages aren't dropped.
      server.accept();

      // Boot a fresh LSP server per connection (matches the prod CLI pattern
      // in packages/lsp-server/src/cli.ts).
      let lsp: ReturnType<typeof createRuneLspServer>;
      try {
        lsp = createRuneLspServer();
      } catch (err) {
        const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
        try {
          server.send(
            JSON.stringify({
              jsonrpc: '2.0',
              method: 'spike/error',
              params: { stage: 'createRuneLspServer', error: msg }
            })
          );
        } catch {
          /* ignore — connection probably half-open */
        }
        server.close(1011, 'createRuneLspServer threw');
        return new Response(null, { status: 101, webSocket: client });
      }

      // Wrap the CF server-side WebSocket in @lspeasy/core's WebSocketTransport.
      // The transport uses addEventListener('message',…) on browsers; CF's
      // WebSocket has the same shape post-accept().
      let transport: WebSocketTransport;
      try {
        transport = new WebSocketTransport({ socket: server as unknown as WebSocket });
      } catch (err) {
        const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
        server.send(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'spike/error',
            params: { stage: 'WebSocketTransport', error: msg }
          })
        );
        server.close(1011, 'WebSocketTransport threw');
        return new Response(null, { status: 101, webSocket: client });
      }

      // The transport waits for an 'open' event before flushing. CF's accepted
      // server WebSocket is already open and never fires 'open', so we
      // synthesize it via a manual dispatch.
      try {
        (server as unknown as EventTarget).dispatchEvent(new Event('open'));
      } catch (err) {
        // If dispatchEvent isn't supported on this socket, fall back to
        // poking the transport's internal state — best-effort. Capture the
        // error as a spike observation.
        server.send(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'spike/warn',
            params: { stage: 'dispatchOpen', error: String(err) }
          })
        );
      }

      // Hand the transport to the LSP server. listen() resolves immediately
      // (the server is now driving the transport's incoming-message loop).
      lsp.listen(transport).catch((err) => {
        const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
        try {
          server.send(
            JSON.stringify({
              jsonrpc: '2.0',
              method: 'spike/error',
              params: { stage: 'lsp.listen', error: msg }
            })
          );
        } catch {
          /* ignore */
        }
      });

      // Stash the sample source on a banner for the test client (so it
      // doesn't have to know the contents).
      server.send(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'spike/ready',
          params: { sample: SAMPLE_ROSETTA, sampleUri: 'file:///spike/sample.rosetta' }
        })
      );

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('rune-lsp-spike: try /spike/health or /spike/ws', { status: 404 });
  }
};
