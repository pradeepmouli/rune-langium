// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type {
  Annotation,
  Data,
  RosettaEnumeration,
  RosettaExternalFunction,
  RosettaRule,
  RosettaTypeAlias
} from '@rune-langium/core';
import type { GeneratorOptions, GeneratorOutput } from '../types.js';
import type { NamespaceRegistry } from './namespace-registry.js';
import type { NamespaceWalkResult } from './namespace-walker.js';

export interface NamespaceEmitter {
  emitHeader?(): void;
  emitCrossNamespaceImports?(): void;
  emitAnnotation?(annotation: Annotation): void;
  emitAfterAnnotations?(): void;
  emitEnumeration(enumeration: RosettaEnumeration): void;
  emitTypeAlias(typeAlias: RosettaTypeAlias): void;
  emitDataPrelude?(): void;
  emitData(data: Data): void;
  emitRule?(rule: RosettaRule): void;
  emitReportMetadata?(): void;
  emitExternalFunction?(func: RosettaExternalFunction): void;
  emitFunctions?(): void;
  finalize(): GeneratorOutput;
}

export interface NamespaceEmitterConstructor {
  new (model: NamespaceWalkResult, options: GeneratorOptions, registry: NamespaceRegistry): NamespaceEmitter;
}

function sortedNames(map: ReadonlyMap<string, unknown>): string[] {
  return Array.from(map.keys()).sort();
}

export function emitNamespaceWithContract(
  model: NamespaceWalkResult,
  options: GeneratorOptions,
  registry: NamespaceRegistry,
  Emitter: NamespaceEmitterConstructor
): GeneratorOutput {
  const emitter = new Emitter(model, options, registry);

  emitter.emitHeader?.();
  emitter.emitCrossNamespaceImports?.();

  for (const name of sortedNames(model.annotationsByName)) {
    emitter.emitAnnotation?.(model.annotationsByName.get(name)!);
  }
  if (model.annotationsByName.size > 0) {
    emitter.emitAfterAnnotations?.();
  }

  for (const name of sortedNames(model.enumByName)) {
    emitter.emitEnumeration(model.enumByName.get(name)!);
  }

  for (const name of sortedNames(model.typeAliasByName)) {
    emitter.emitTypeAlias(model.typeAliasByName.get(name)!);
  }

  emitter.emitDataPrelude?.();

  const emittedData = new Set<string>();
  for (const typeName of model.emitOrder) {
    const data = model.dataByName.get(typeName);
    if (!data) continue;
    emittedData.add(typeName);
    emitter.emitData(data);
  }

  for (const typeName of sortedNames(model.dataByName).filter((name) => !emittedData.has(name))) {
    emitter.emitData(model.dataByName.get(typeName)!);
  }

  for (const name of sortedNames(model.rulesByName)) {
    emitter.emitRule?.(model.rulesByName.get(name)!);
  }

  emitter.emitReportMetadata?.();

  for (const name of sortedNames(model.libraryFuncsByName)) {
    emitter.emitExternalFunction?.(model.libraryFuncsByName.get(name)!);
  }

  emitter.emitFunctions?.();

  return emitter.finalize();
}
