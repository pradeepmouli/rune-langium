// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Container HTTP wrapper for the hosted codegen service (feature 011-export-code-cf).
 *
 * Owns the new public contract expected by the Worker fronting this container:
 *   - GET  /api/generate/health
 *   - POST /api/generate
 *
 * Delegates actual codegen to the existing `CodegenServiceProxy` from
 * `@rune-langium/codegen/node`, which already handles spawning
 * `codegen-cli.sh`, piping JSON over stdin/stdout, and surfacing errors.
 *
 * Explicitly does NOT log request or response bodies (FR-008 / SC-008).
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { CodeGenerationRequest, CodeGenerationResult } from '@rune-langium/codegen';
import { CodegenServiceProxy } from '@rune-langium/codegen/node';

interface CodegenProxyLike {
  listLanguages(): Promise<Array<{ id: string; class: string }>>;
  generate(request: CodeGenerationRequest, signal?: AbortSignal): Promise<CodeGenerationResult>;
  isAvailable(): Promise<boolean>;
}

export interface ContainerServerOptions {
  /** Injected proxy for tests; production defaults to a fresh CodegenServiceProxy. */
  proxy?: CodegenProxyLike;
  /** Path to codegen-cli.sh when defaulting to CodegenServiceProxy; read from env by default. */
  cliPath?: string;
}

const MAX_BODY_BYTES = 4 * 1024 * 1024; // 4 MB — generous for model uploads, hard cap for abuse.

function defaultProxy(cliPath?: string): CodegenProxyLike {
  const explicit = cliPath ?? process.env['CODEGEN_CLI'];
  return new CodegenServiceProxy(explicit);
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        req.destroy();
        reject(new RangeError('request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(raw) as T);
      } catch (err) {
        reject(new SyntaxError('malformed JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function createContainerServer(options: ContainerServerOptions = {}): Server {
  const proxy = options.proxy ?? defaultProxy(options.cliPath);

  return createServer(async (req, res) => {
    const { method, url } = req;

    // Routing table — strict, small, and deliberately no CORS headers
    // because this container is only reached by the Worker via a typed
    // binding (same origin at the edge).
    try {
      if (url === '/api/generate/health') {
        if (method !== 'GET') return writeJson(res, 405, { error: 'method_not_allowed' });
        await handleHealth(proxy, res);
        return;
      }
      if (url === '/api/generate') {
        if (method !== 'POST') return writeJson(res, 405, { error: 'method_not_allowed' });
        await handleGenerate(proxy, req, res);
        return;
      }
      writeJson(res, 404, { error: 'not_found' });
    } catch (err) {
      // Last-resort catch — writeJson-level errors only. Never log bodies.
      writeJson(res, 500, { error: 'internal_error' });
    }
  });
}

async function handleHealth(proxy: CodegenProxyLike, res: ServerResponse): Promise<void> {
  try {
    const languages = await proxy.listLanguages();
    writeJson(res, 200, {
      status: 'ok',
      cold_start_likely: false,
      languages: languages.map((l) => l.id)
    });
  } catch (err) {
    writeJson(res, 503, {
      status: 'unavailable',
      message: 'The code generation service is temporarily unavailable.'
    });
  }
}

async function handleGenerate(
  proxy: CodegenProxyLike,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  let request: CodeGenerationRequest;
  try {
    request = await readJsonBody<CodeGenerationRequest>(req);
  } catch (err) {
    const status = err instanceof RangeError ? 413 : 400;
    const code = err instanceof RangeError ? 'payload_too_large' : 'bad_json';
    writeJson(res, status, { error: code });
    return;
  }

  try {
    const result = await proxy.generate(request);
    const status = result.errors.length > 0 ? 422 : 200;
    writeJson(res, status, result);
  } catch (err) {
    // Do NOT include err.message — it could contain fragments of the user's source.
    writeJson(res, 500, { error: 'generation_failed' });
  }
}

// Entry point when the container is invoked directly (ENTRYPOINT ["node", "/app/dist/server.js"]).
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env['PORT']) || 8080;
  const server = createContainerServer();
  server.listen(port, () => {
    // Minimal startup log — no bodies, no config secrets.
    // eslint-disable-next-line no-console
    console.log(`codegen-container listening on :${port}`);
  });
}
