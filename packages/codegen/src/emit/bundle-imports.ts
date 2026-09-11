// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { resolveImportPath, type NamespaceRegistry } from './namespace-registry.js';

/** Bundled declarations share a module, so their original relative imports disappear. */
export function stripBundledImports(
  content: string,
  fromPath: string,
  bundledPaths: readonly string[],
  extension: '.ts' | '.zod.ts'
): string {
  const namespace = (path: string) => path.slice(0, -extension.length).replace(/\//g, '.');
  const registry: NamespaceRegistry = { namespaces: new Map() };
  const imports = new Set(
    bundledPaths.map(
      (path) =>
        `${resolveImportPath(namespace(fromPath), namespace(path), registry)}${extension.replace(/\.ts$/, '.js')}`
    )
  );
  return content
    .split('\n')
    .filter((line) => {
      const match = /^import .* from ['"]([^'"]+)['"];$/.exec(line);
      return !match || !imports.has(match[1]!);
    })
    .join('\n');
}
