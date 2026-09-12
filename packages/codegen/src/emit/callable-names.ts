// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import {
  isRosettaRule,
  type RosettaFunction,
  type RosettaExternalFunction,
  type RosettaRule
} from '@rune-langium/core';
import type { NamespaceRegistry } from './namespace-registry.js';

export type CallableDeclaration = RosettaFunction | RosettaExternalFunction | RosettaRule;

export function callableExportName(declaration: CallableDeclaration): string {
  return isRosettaRule(declaration)
    ? `${declaration.eligibility ? 'validate' : 'extract'}${declaration.name}`
    : declaration.name;
}

/** One name allocation shared by imports, calls, and bundled exports. */
export class CallableNames {
  private readonly owners = new Map<string, Set<string>>();
  private readonly aliases = new Map<string, string>();

  constructor(registry: NamespaceRegistry) {
    for (const [namespace, manifest] of registry.namespaces) {
      const names = new Set([
        ...manifest.exportedDataNames,
        ...[...manifest.exportedDataNames].flatMap((name) => [`${name}Shape`, `is${name}`]),
        ...manifest.exportedEnumNames,
        ...[...manifest.exportedEnumNames].flatMap((name) => [`${name}Values`, `${name}DisplayNames`]),
        ...manifest.exportedFuncNames,
        ...manifest.exportedTypeAliasNames,
        ...manifest.exportedAnnotationNames,
        ...[...manifest.exportedAnnotationNames].map((name) => `${name}Args`),
        ...manifest.exportedLibraryFuncNames,
        ...[...manifest.exportedRuleNames].flatMap((name) => [`extract${name}`, `validate${name}`]),
        ...(manifest.exportedRuleNames.size ? ['runeReportRules'] : [])
      ]);
      for (const name of names) {
        const owners = this.owners.get(name) ?? new Set<string>();
        owners.add(namespace);
        this.owners.set(name, owners);
      }
    }
    const reserved = new Set(this.owners.keys());
    for (const [name, owners] of [...this.owners].sort(([a], [b]) => a.localeCompare(b))) {
      for (const namespace of [...owners].sort()) {
        const base = `__rune$${namespace.replace(/[^\w$]/g, '$')}$${name}`;
        let alias = base;
        for (let suffix = 1; reserved.has(alias); suffix++) alias = `${base}_${suffix}`;
        reserved.add(alias);
        this.aliases.set(`${namespace}.${name}`, alias);
      }
    }
  }

  alias(namespace: string, name: string): string {
    return this.aliases.get(`${namespace}.${name}`) ?? name;
  }

  bundled(namespace: string, name: string): string {
    return (this.owners.get(name)?.size ?? 0) > 1 ? this.alias(namespace, name) : name;
  }
}
