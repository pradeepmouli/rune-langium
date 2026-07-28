// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import type {
  Annotation,
  Choice,
  Data,
  RosettaEnumeration,
  RosettaExternalFunction,
  RosettaReport,
  RosettaRule,
  RosettaTypeAlias
} from '@rune-langium/core';
import { emitNamespaceWithContract, type NamespaceEmitter } from '../src/emit/namespace-emitter.js';
import type { NamespaceRegistry } from '../src/emit/namespace-registry.js';
import type { NamespaceWalkResult } from '../src/emit/namespace-walker.js';
import type { GeneratorOptions } from '../src/types.js';
import type { TypeReferenceGraph } from '../src/cycle-detector.js';

function named<T extends { name: string }>(name: string): T {
  return { name } as T;
}

describe('namespace emitter contract', () => {
  it('drives namespace emission in deterministic category order', () => {
    const events: string[] = [];
    const model: NamespaceWalkResult = {
      docs: [],
      namespace: 'test.contract',
      dataByName: new Map<string, Data>([
        ['Bravo', named<Data>('Bravo')],
        ['Alpha', named<Data>('Alpha')],
        ['Delta', named<Data>('Delta')]
      ]),
      enumByName: new Map<string, RosettaEnumeration>([
        ['Zeta', named<RosettaEnumeration>('Zeta')],
        ['Beta', named<RosettaEnumeration>('Beta')]
      ]),
      typeAliasByName: new Map<string, RosettaTypeAlias>([
        ['Omega', named<RosettaTypeAlias>('Omega')],
        ['Gamma', named<RosettaTypeAlias>('Gamma')]
      ]),
      rulesByName: new Map<string, RosettaRule>([
        ['RuleB', named<RosettaRule>('RuleB')],
        ['RuleA', named<RosettaRule>('RuleA')]
      ]),
      reportsByName: new Map<string, RosettaReport>(),
      annotationsByName: new Map<string, Annotation>([['Ann', named<Annotation>('Ann')]]),
      libraryFuncsByName: new Map<string, RosettaExternalFunction>([
        ['LibB', named<RosettaExternalFunction>('LibB')],
        ['LibA', named<RosettaExternalFunction>('LibA')]
      ]),
      choiceByName: new Map<string, Choice>(),
      emitOrder: ['Bravo', 'Alpha'],
      cyclicTypes: new Set(),
      graph: { nodes: [], edges: new Map<string, string[]>() } satisfies TypeReferenceGraph
    };

    class TestNamespaceEmitter implements NamespaceEmitter {
      constructor(_model: NamespaceWalkResult, _options: GeneratorOptions, _registry: NamespaceRegistry) {}

      emitHeader(): void {
        events.push('header');
      }
      emitCrossNamespaceImports(): void {
        events.push('imports');
      }
      emitAnnotation(annotation: Annotation): void {
        events.push(`annotation:${annotation.name}`);
      }
      emitEnumeration(enumeration: RosettaEnumeration): void {
        events.push(`enum:${enumeration.name}`);
      }
      emitTypeAlias(typeAlias: RosettaTypeAlias): void {
        events.push(`alias:${typeAlias.name}`);
      }
      emitDataPrelude(): void {
        events.push('prelude');
      }
      emitData(data: Data): void {
        events.push(`data:${data.name}`);
      }
      emitRule(rule: RosettaRule): void {
        events.push(`rule:${rule.name}`);
      }
      emitReportMetadata(): void {
        events.push('report-meta');
      }
      emitExternalFunction(func: RosettaExternalFunction): void {
        events.push(`external:${func.name}`);
      }
      emitFunctions(): void {
        events.push('functions');
      }
      finalize() {
        events.push('finalize');
        return {
          relativePath: 'test/contract.ts',
          content: '',
          sourceMap: [],
          diagnostics: [],
          funcs: []
        };
      }
    }

    emitNamespaceWithContract(model, {}, { namespaces: new Map() }, TestNamespaceEmitter);

    expect(events).toEqual([
      'header',
      'imports',
      'annotation:Ann',
      'enum:Beta',
      'enum:Zeta',
      'alias:Gamma',
      'alias:Omega',
      'prelude',
      'data:Bravo',
      'data:Alpha',
      'data:Delta',
      'rule:RuleA',
      'rule:RuleB',
      'report-meta',
      'external:LibA',
      'external:LibB',
      'functions',
      'finalize'
    ]);
  });
});
