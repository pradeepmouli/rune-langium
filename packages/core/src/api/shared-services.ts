// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { createRuneDslServices } from '../services/rune-dsl-module.js';

let _services: ReturnType<typeof createRuneDslServices> | undefined;

/**
 * Lazily-initialized module-level services singleton shared by the
 * document-based `parse()`/`parseWorkspace()` APIs and the bare-rule
 * `parseExpression()` API. Long-running servers should call
 * `createRuneDslServices()` directly instead.
 */
export function getSharedServices(): ReturnType<typeof createRuneDslServices> {
  if (!_services) {
    _services = createRuneDslServices();
  }
  return _services;
}
