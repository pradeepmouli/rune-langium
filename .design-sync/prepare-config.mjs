// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const configOutput = resolve(root, '.design-sync/.cache/config.json');
const require = createRequire(new URL('../apps/studio/package.json', import.meta.url));
const { Project, ts } = require('ts-morph');

export function createProject() {
  return new Project({
    tsConfigFilePath: resolve(root, 'packages/visual-editor/tsconfig.json'),
    skipAddingFilesFromTsConfig: true
  });
}

// Inline workspace-owned API types for the converter's self-contained prop bodies.
// TypeScript owns property optionality, inherited members and callback signatures.
function printType(type, at, active = new Set()) {
  const alias = type.getAliasSymbol();
  const symbol = alias ?? type.getSymbol();
  const declarations = symbol?.getDeclarations() ?? [];
  if (declarations.some((d) => d.getSourceFile().getFilePath().includes('/@types/react/'))) {
    return `React.${symbol.getName()}`;
  }
  if (active.has(type)) throw new Error(`Recursive prop type: ${type.getText(at)}`);
  const next = new Set(active).add(type);
  if (type.isUnion())
    return type
      .getUnionTypes()
      .map((t) => {
        const text = printType(t, at, next);
        return t.getCallSignatures().length === 1 ? `(${text})` : text;
      })
      .join(' | ');
  if (type.isArray()) return `Array<${printType(type.getArrayElementTypeOrThrow(), at, next)}>`;
  const signatures = type.getCallSignatures();
  if (signatures.length === 1) {
    const signature = signatures[0];
    const params = signature.getParameters().map((p) => {
      const declaration = p.getDeclarations()[0];
      return `${p.getName()}${p.isOptional() ? '?' : ''}: ${printType(p.getTypeAtLocation(declaration), declaration, next)}`;
    });
    return `(${params.join(', ')}) => ${printType(signature.getReturnType(), at, next)}`;
  }
  if (type.isObject() && declarations.some((d) => d.getSourceFile().getFilePath().startsWith(`${root}packages/`))) {
    return `{\n${printProperties(type, at, next)}\n}`;
  }
  return type.getText(at, ts.TypeFormatFlags.NoTruncation);
}

function printProperties(type, at, active = new Set()) {
  return type
    .getProperties()
    .map((property) => {
      const declaration = property.getDeclarations()[0] ?? at;
      const docs = (declaration.getJsDocs?.() ?? []).map((doc) => doc.getCommentText() ?? '').join(' ');
      const comment = docs ? `  /** ${docs.replaceAll('*/', '* /')} */\n` : '';
      const readonly = declaration.hasModifier?.(ts.SyntaxKind.ReadonlyKeyword) ? 'readonly ' : '';
      const name = property.getName();
      const key = ts.isIdentifierText(name, ts.ScriptTarget.Latest) ? name : JSON.stringify(name);
      return `${comment}  ${readonly}${key}${property.isOptional() ? '?' : ''}: ${printType(property.getTypeAtLocation(declaration), declaration, active)};`;
    })
    .join('\n');
}

export function prepareConfig(config, project = createProject()) {
  if (config.dtsPropsFor) throw new Error('Authoritative config must not contain handwritten dtsPropsFor');
  const pkgDir = resolve(root, 'packages/design-system');
  const dtsPropsFor = {};
  for (const [name, relativeSource] of Object.entries(config.componentSrcMap)) {
    const source = project.addSourceFileAtPath(resolve(pkgDir, relativeSource));
    const declaration = source.getExportedDeclarations().get(name)?.[0];
    const signature = declaration?.getType().getCallSignatures()[0];
    if (!signature) throw new Error(`No component call signature for ${name}`);
    const parameter = signature.getParameters()[0];
    dtsPropsFor[name] = parameter
      ? printProperties(parameter.getTypeAtLocation(declaration), declaration)
      : '  /* This component accepts no props. */';
  }
  return {
    ...config,
    // The converter resolves its header relative to the generated config's directory.
    readmeHeader: relative(dirname(configOutput), resolve(root, config.readmeHeader)),
    dtsPropsFor
  };
}

export function writeConfig() {
  const config = JSON.parse(readFileSync(resolve(root, '.design-sync/config.json'), 'utf8'));
  mkdirSync(dirname(configOutput), { recursive: true });
  writeFileSync(configOutput, JSON.stringify(prepareConfig(config), null, 2) + '\n');
  return configOutput;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(writeConfig());
}
