#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Standalone entry point: starts the codegen HTTP server.
 * Usage: node dist/serve.js [--port 8377] [--cli /path/to/codegen-cli.sh]
 *
 * Studio (fetch) → HTTP (this server) → CodegenServiceProxy → stdio → CodegenCli.java
 */

import { CodegenServiceProxy } from './codegen-service.js';

const args = process.argv.slice(2);
let port = 8377;
let cliPath: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    port = parseInt(args[++i]!, 10);
  } else if (args[i] === '--cli' && args[i + 1]) {
    cliPath = args[++i];
  }
}

const proxy = new CodegenServiceProxy(cliPath);
proxy.serve(port);
