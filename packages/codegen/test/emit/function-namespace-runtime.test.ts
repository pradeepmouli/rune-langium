// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import ts from 'typescript-classic';
import { generate } from '../../src/export.js';

describe('qualified TypeScript function calls', () => {
  it.each(['per-namespace', 'barrel', 'single-file'] as const)(
    'keeps same-named declarations distinct in %s output',
    async (layout) => {
      const { RuneDsl } = createRuneDslServices();
      const sources = ['alpha', 'beta'].map(
        (namespace, index) => `namespace ${namespace}
func Echo:
 inputs: value int (1..1)
 output: result int (1..1)
 set result: value + ${index + 1}
func Zero:
 output: result int (1..1)
 set result: ${index + 1}
library function Custom(value int) int
reporting rule Read from int: item + ${index + 1}
`
      );
      sources[0] += '\ntype Entry:\n value int (1..1)\n';
      sources[1] += '\nfunc isEntry:\n inputs: value int (1..1)\n output: result int (1..1)\n set result: value + 3\n';
      sources.push(`namespace caller
func GuardName:
 inputs: value int (1..1)
 output: result int (1..1)
 set result: beta.isEntry(value)
func Echo:
 inputs: value int (1..1)
 output: result int (1..1)
 set result: alpha.Echo(value) + beta.Echo(value)
func Shadowed:
 inputs: value int (1..1)
 output: result int (1..1)
 alias Echo: value + 10
 alias __rune_alpha_Echo: value + 20
 set result: caller.Echo(value) + alpha.Echo(value)
func Both:
 inputs: value int (1..1)
 output: result int (1..1)
 set result: Echo(value)
func Constants:
 output: result int (1..1)
 set result: alpha.Zero + beta.Zero
func Pipeline:
 inputs: value int (1..1)
 output: result int (1..1)
 set result: value then alpha.Echo
func Child extends alpha.Echo:
 set result: super(value)
func Rules:
 inputs: value int (1..1)
 output: result int (1..1)
 set result: alpha.Read(value) + beta.Read(value)
func Libraries:
 inputs: value int (1..1)
 output: result int (1..1)
 set result: alpha.Custom(value) + beta.Custom(value)
`);
      const docs = sources.map((source, index) =>
        RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
          source,
          URI.parse(`inmemory:///qualified-${index}.rosetta`)
        )
      );
      await RuneDsl.shared.workspace.DocumentBuilder.build(docs);
      expect(docs.flatMap((doc) => doc.parseResult.parserErrors)).toEqual([]);
      const outputs = await generate(docs, { target: 'typescript', typescript: { layout } });
      expect(outputs.flatMap((output) => output.diagnostics.filter((d) => d.severity === 'error'))).toEqual([]);
      const directory = mkdtempSync(join(tmpdir(), 'rune-qualified-runtime-'));
      try {
        writeFileSync(join(directory, 'package.json'), '{"type":"commonjs"}');
        const files = outputs.map((output) => {
          const path = join(directory, output.relativePath);
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, output.content);
          return path;
        });
        const program = ts.createProgram(files, {
          strict: true,
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.NodeNext,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
          skipLibCheck: true,
          types: []
        });
        expect(
          ts
            .getPreEmitDiagnostics(program)
            .map(
              (d) =>
                ts.flattenDiagnosticMessageText(d.messageText, '\n') +
                (d.file && d.start !== undefined
                  ? '\n' + d.file.text.split('\n')[d.file.getLineAndCharacterOfPosition(d.start).line]
                  : '')
            )
        ).toEqual([]);
        program.emit();
        const require = createRequire(join(directory, 'entry.js'));
        const entry = layout === 'single-file' ? 'model' : layout === 'barrel' ? 'index' : 'caller';
        const funcs = require(`./${entry}.js`);
        const first = layout === 'per-namespace' ? require('./alpha.js').Custom : funcs.__rune$alpha$Custom;
        const second = layout === 'per-namespace' ? require('./beta.js').Custom : funcs.__rune$beta$Custom;
        first.implementation = (value: number) => value + 10;
        second.implementation = (value: number) => value + 20;
        expect(funcs.Both({ value: 4 })).toBe(11);
        expect(funcs.GuardName({ value: 4 })).toBe(7);
        expect(funcs.Shadowed({ value: 4 })).toBe(16);
        expect(funcs.Constants({})).toBe(3);
        expect(funcs.Pipeline({ value: 4 })).toBe(5);
        expect(funcs.Child({ value: 4 })).toBe(5);
        expect(funcs.Rules({ value: 4 })).toBe(11);
        expect(funcs.Libraries({ value: 4 })).toBe(38);
        if (layout !== 'per-namespace') {
          expect(funcs.__rune$alpha$Echo({ value: 4 })).toBe(5);
          expect(funcs.__rune$beta$Echo({ value: 4 })).toBe(6);
          expect(funcs.__rune$caller$Echo({ value: 4 })).toBe(11);
        }
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  );
});
