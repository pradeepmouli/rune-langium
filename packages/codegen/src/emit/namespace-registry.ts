// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { LangiumDocument } from 'langium';
import {
  isAnnotation,
  isData,
  isRosettaEnumeration,
  isRosettaExternalFunction,
  isRosettaFunction,
  isRosettaModel,
  isRosettaReport,
  isRosettaRule,
  isRosettaTypeAlias,
  type RosettaModel
} from '@rune-langium/core';

export interface NamespaceManifest {
  namespace: string;
  exportedDataNames: Set<string>;
  exportedEnumNames: Set<string>;
  exportedFuncNames: Set<string>;
  exportedRuleNames: Set<string>;
  exportedTypeAliasNames: Set<string>;
  exportedAnnotationNames: Set<string>;
  exportedLibraryFuncNames: Set<string>;
  relativePath: string;
}

export interface NamespaceRegistry {
  namespaces: Map<string, NamespaceManifest>;
}

export function buildNamespaceRegistry(
  groupedDocs: Map<string, LangiumDocument[]>
): NamespaceRegistry {
  const namespaces = new Map<string, NamespaceManifest>();

  for (const [namespace, docs] of groupedDocs) {
    const manifest: NamespaceManifest = {
      namespace,
      exportedDataNames: new Set(),
      exportedEnumNames: new Set(),
      exportedFuncNames: new Set(),
      exportedRuleNames: new Set(),
      exportedTypeAliasNames: new Set(),
      exportedAnnotationNames: new Set(),
      exportedLibraryFuncNames: new Set(),
      relativePath: namespace.replace(/\./g, '/')
    };

    for (const doc of docs) {
      const model = doc.parseResult?.value;
      if (!model || !isRosettaModel(model)) continue;

      for (const element of (model as RosettaModel).elements) {
        if (isData(element)) {
          manifest.exportedDataNames.add(element.name);
        } else if (isRosettaEnumeration(element)) {
          manifest.exportedEnumNames.add(element.name);
        } else if (isRosettaFunction(element)) {
          manifest.exportedFuncNames.add(element.name);
        } else if (isRosettaRule(element)) {
          manifest.exportedRuleNames.add(element.name);
        } else if (isRosettaTypeAlias(element)) {
          manifest.exportedTypeAliasNames.add(element.name);
        } else if (isAnnotation(element)) {
          manifest.exportedAnnotationNames.add(element.name);
        } else if (isRosettaExternalFunction(element)) {
          manifest.exportedLibraryFuncNames.add(element.name);
        } else if (isRosettaReport(element)) {
          // Reports don't export named symbols — they reference other types
        }
      }
    }

    namespaces.set(namespace, manifest);
  }

  return { namespaces };
}

export function resolveImportPath(
  fromNamespace: string,
  toNamespace: string,
  _registry: NamespaceRegistry
): string {
  const fromParts = fromNamespace.split('.');
  const toParts = toNamespace.split('.');

  // Compute relative path from fromNamespace directory to toNamespace file
  // Each namespace maps to a directory: a.b.c → a/b/c/
  // Output file is at: a/b/c.zod.ts or a/b/c.ts (suffix added by caller)
  const ups = fromParts.length;
  const upSegment = '../'.repeat(ups);
  return upSegment + toParts.join('/');
}

export function findNamespaceForSymbol(
  symbolName: string,
  currentNamespace: string,
  registry: NamespaceRegistry
): string | undefined {
  // First check current namespace
  const current = registry.namespaces.get(currentNamespace);
  if (current) {
    if (
      current.exportedDataNames.has(symbolName) ||
      current.exportedEnumNames.has(symbolName) ||
      current.exportedFuncNames.has(symbolName) ||
      current.exportedRuleNames.has(symbolName) ||
      current.exportedTypeAliasNames.has(symbolName) ||
      current.exportedAnnotationNames.has(symbolName) ||
      current.exportedLibraryFuncNames.has(symbolName)
    ) {
      return currentNamespace;
    }
  }

  // Search other namespaces
  for (const [ns, manifest] of registry.namespaces) {
    if (ns === currentNamespace) continue;
    if (
      manifest.exportedDataNames.has(symbolName) ||
      manifest.exportedEnumNames.has(symbolName) ||
      manifest.exportedFuncNames.has(symbolName) ||
      manifest.exportedRuleNames.has(symbolName) ||
      manifest.exportedTypeAliasNames.has(symbolName) ||
      manifest.exportedAnnotationNames.has(symbolName) ||
      manifest.exportedLibraryFuncNames.has(symbolName)
    ) {
      return ns;
    }
  }

  return undefined;
}
