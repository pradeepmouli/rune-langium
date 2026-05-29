// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { NamespaceRegistry } from './namespace-registry.js';
import type { NamespaceEmitterOptions } from './namespace-emitter.js';
import type { NamespaceWalkResult } from './namespace-walker.js';
import type { GeneratorOutput } from '../types.js';

export abstract class BaseNamespaceEmitter {
  protected readonly model: NamespaceWalkResult;
  protected readonly registry: NamespaceRegistry;
  protected readonly suppressBoilerplate: boolean;

  constructor(model: NamespaceWalkResult, options: NamespaceEmitterOptions, registry: NamespaceRegistry) {
    this.model = model;
    this.registry = registry;
    this.suppressBoilerplate = options.suppressBoilerplate ?? false;
  }

  abstract finalize(): GeneratorOutput;
}
