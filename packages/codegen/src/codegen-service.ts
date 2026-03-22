// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Code generation service proxy.
 * Spawns the rosetta-code-generators CLI as a subprocess,
 * piping JSON requests via stdin and reading JSON responses from stdout.
 *
 * Also exposes an HTTP server mode so the browser (BrowserCodegenProxy)
 * can reach it via fetch:
 *   Studio (fetch) → HTTP → CodegenServiceProxy.serve() → stdio → CodegenCli.java
 *
 * @see specs/008-core-editor-features/contracts/codegen-api.md
 */

import { spawn } from 'node:child_process';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accessSync, constants } from 'node:fs';
import type { CodeGenerationRequest, CodeGenerationResult } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Proxy that spawns the codegen CLI subprocess for each request.
 * The CLI reads JSON from stdin (--json mode) and writes JSON to stdout.
 */
export class CodegenServiceProxy {
  private readonly cliPath: string;

  constructor(cliPath?: string) {
    this.cliPath =
      cliPath ??
      process.env['RUNE_CODEGEN_CLI'] ??
      resolve(__dirname, '../server/target/codegen-cli.sh');
  }

  /**
   * Generate code from .rosetta model files.
   */
  async generate(
    request: CodeGenerationRequest,
    signal?: AbortSignal
  ): Promise<CodeGenerationResult> {
    const result = await this.runCli(['--json'], JSON.stringify(request), signal);
    return {
      language: request.language,
      files: result['files'] as CodeGenerationResult['files'],
      errors: result['errors'] as CodeGenerationResult['errors'],
      warnings: (result['warnings'] as string[]) ?? []
    };
  }

  /**
   * List available code generators.
   */
  async listLanguages(): Promise<Array<{ id: string; class: string }>> {
    const result = await this.runCli(['--list-languages']);
    return result['languages'] as Array<{ id: string; class: string }>;
  }

  /**
   * Check if the codegen CLI is available and runnable.
   */
  async isAvailable(): Promise<boolean> {
    try {
      accessSync(this.cliPath, constants.X_OK);
      await this.listLanguages();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Start an HTTP server that proxies requests to the codegen CLI.
   * Exposes: GET /api/health, GET /api/languages, POST /api/generate
   */
  serve(port = 8377): Server {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      // CORS headers for browser access
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      try {
        if (req.url === '/api/health' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
        } else if (req.url === '/api/languages' && req.method === 'GET') {
          const languages = await this.listLanguages();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ languages }));
        } else if (req.url === '/api/generate' && req.method === 'POST') {
          const body = await readBody(req);
          const request = JSON.parse(body) as CodeGenerationRequest;
          const result = await this.generate(request);

          if (result.errors.length > 0) {
            res.writeHead(422, { 'Content-Type': 'application/json' });
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
          }
          res.end(JSON.stringify(result));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
      }
    });

    server.listen(port, () => {
      console.log(`Codegen server listening on http://localhost:${port}`);
      console.log(`  CLI: ${this.cliPath}`);
      console.log(`  Endpoints: /api/health, /api/languages, POST /api/generate`);
    });

    return server;
  }

  private runCli(
    args: string[],
    stdin?: string,
    signal?: AbortSignal
  ): Promise<Record<string, unknown>> {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(this.cliPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        signal
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('close', (code: number | null) => {
        try {
          const parsed = JSON.parse(stdout) as Record<string, unknown>;
          resolvePromise(parsed);
        } catch {
          reject(
            new Error(`Codegen CLI failed (exit ${code}): ${stderr || stdout || 'no output'}`)
          );
        }
      });

      child.on('error', (err: Error) => {
        reject(new Error(`Failed to spawn codegen CLI: ${err.message}`));
      });

      if (stdin) {
        child.stdin.write(stdin);
        child.stdin.end();
      }
    });
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}
