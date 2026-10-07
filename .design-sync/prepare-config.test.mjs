// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createProject, prepareConfig } from './prepare-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8'));

test('generated contracts are assignable both ways to the real component props', () => {
  const project = createProject();
  const generated = prepareConfig(config, project);
  assert.equal(resolve(root, '.design-sync/.cache', generated.readmeHeader), resolve(root, config.readmeHeader));
  const contracts = Object.entries(config.componentSrcMap)
    .map(
      ([name, source]) => `
    type Real${name} = Parameters<typeof import("../${source}").${name}> extends [infer Props, ...unknown[]] ? Props : {};
    interface Generated${name} { ${generated.dtsPropsFor[name]} }
    declare const real${name}: Real${name};
    declare const generated${name}: Generated${name};
    const source${name}: Real${name} = generated${name};
    const emitted${name}: Generated${name} = real${name};
  `
    )
    .join('\n');
  const source = project.createSourceFile(
    resolve(root, 'packages/visual-editor/src/design-sync-contracts.ts'),
    `import type * as React from 'react';\n${contracts}`,
    { overwrite: true }
  );
  assert.deepEqual(
    source.getPreEmitDiagnostics().map((d) => d.getMessageText()),
    []
  );
});

test('source API changes flow into the next converter config without copied declarations', () => {
  const project = createProject();
  const component = project.addSourceFileAtPath(
    resolve(root, 'packages/visual-editor/src/components/editors/TypeSelector.tsx')
  );
  component.getInterfaceOrThrow('TypeSelectorTriggerProps').addProperty({ name: 'designSyncProbe', type: 'string' });
  const generated = prepareConfig(config, project);
  assert.match(generated.dtsPropsFor.TypeSelector, /designSyncProbe: string/);
  assert.doesNotMatch(generated.dtsPropsFor.TypeSelector, /props: unknown/);
});
