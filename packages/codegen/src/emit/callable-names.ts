// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import {
  isRosettaRule,
  type RosettaFunction,
  type RosettaExternalFunction,
  type RosettaRule
} from '@rune-langium/core';
import type { NamespaceRegistry } from './namespace-registry.js';
import { RUNE_HELPER_NAMES } from '../helpers.js';

export type CallableDeclaration = RosettaFunction | RosettaExternalFunction | RosettaRule;

export function callableExportName(declaration: CallableDeclaration): string {
  return isRosettaRule(declaration)
    ? `${declaration.eligibility ? 'validate' : 'extract'}${declaration.name}`
    : declaration.name;
}

/** One name allocation shared by imports, calls, and bundled exports. */
export class CallableNames {
  private readonly functionExports = new Map<string, string>();
  private readonly dataExports = new Map<string, string>();
  private readonly owners = new Map<string, Set<string>>();
  private readonly aliases = new Map<string, string>();

  constructor(registry: NamespaceRegistry) {
    for (const [namespace, manifest] of registry.namespaces) {
      const typeNames = new Set([
        ...manifest.exportedDataNames,
        ...manifest.exportedEnumNames,
        ...manifest.exportedTypeAliasNames,
        ...manifest.exportedAnnotationNames
      ]);
      const helpers = new Set<string>(RUNE_HELPER_NAMES);
      const reserved = new Set([
        ...typeNames,
        ...manifest.exportedFuncNames,
        ...manifest.exportedLibraryFuncNames,
        ...helpers
      ]);
      for (const name of [...manifest.exportedFuncNames, ...manifest.exportedLibraryFuncNames].sort()) {
        if (!typeNames.has(name) && !helpers.has(name)) continue;
        const base = `${name}Function`;
        let exported = base;
        for (let suffix = 1; reserved.has(exported); suffix++) exported = `${base}${suffix}`;
        reserved.add(exported);
        this.functionExports.set(`${namespace}.${name}`, exported);
      }
      for (const name of [...manifest.exportedDataNames].sort()) {
        if (!helpers.has(name)) continue;
        const base = `${name}Data`;
        let exported = base;
        for (let suffix = 1; reserved.has(exported); suffix++) exported = `${base}${suffix}`;
        reserved.add(exported);
        this.dataExports.set(`${namespace}.${name}`, exported);
      }
      const names = new Set([
        ...[...manifest.exportedDataNames].map((name) => this.dataExported(namespace, name)),
        ...[...manifest.exportedDataNames].flatMap((name) => [`${name}Shape`, `is${name}`]),
        ...manifest.exportedEnumNames,
        ...[...manifest.exportedEnumNames].flatMap((name) => [`${name}Values`, `${name}DisplayNames`]),
        ...[...manifest.exportedFuncNames].map((name) => this.exported(namespace, name)),
        ...manifest.exportedTypeAliasNames,
        ...manifest.exportedAnnotationNames,
        ...[...manifest.exportedAnnotationNames].map((name) => `${name}Args`),
        ...[...manifest.exportedLibraryFuncNames].map((name) => this.exported(namespace, name)),
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

  exported(namespace: string, name: string): string {
    return this.functionExports.get(`${namespace}.${name}`) ?? name;
  }

  dataExported(namespace: string, name: string): string {
    return this.dataExports.get(`${namespace}.${name}`) ?? name;
  }

  alias(namespace: string, name: string): string {
    return this.aliases.get(`${namespace}.${name}`) ?? name;
  }

  bundled(namespace: string, name: string): string {
    return (this.owners.get(name)?.size ?? 0) > 1 ? this.alias(namespace, name) : name;
  }
}
