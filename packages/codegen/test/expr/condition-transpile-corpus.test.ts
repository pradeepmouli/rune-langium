// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Corpus diagnostic gate — verifies the transpiler-emitter-parity work
 * closes the 16-case W1 gap across REAL corpus expressions, not just the
 * hand-written unit fixtures.
 *
 * Walks every `.rosetta` file under `.resources/` (mirrors the file-walking
 * idiom in expression-corpus-sweep.test.ts), collects every `Condition`,
 * and transpiles its `expression` through `transpileCondition` (the same
 * dispatcher zod-emitter/ts-emitter call) with a neutral zod-refine
 * context. Counts `/* DIAGNOSTIC` occurrences in the output.
 *
 * Asserts zero DIAGNOSTIC for BOTH Data-attached conditions (the primary W1
 * emission surface — `ts-emitter.emitData` / `zod-emitter`'s per-Data
 * condition block) and func-attached conditions (`RosettaFunction` pre/post-
 * conditions). Func-attached conditions resolve names against the func's own
 * scope — `buildFuncAttributeContext` below builds `attributeTypes` from
 * `func.inputs`/`func.output` and `localBindings` from `func.shortcuts`
 * (aliases), mirroring `ts-emitter.ts`'s `buildFuncBodyContext` but without
 * the full `RuneFunc`/`extractFuncs` body-emission machinery (assignments,
 * call graph, output-accumulator kind) that gate doesn't need — only name
 * resolution matters for validating `exists`/`is absent`/`one-of`/`choice`/
 * `only-exists` references. The grammar (`rune-dsl.langium`'s
 * `RosettaFunction` rule: `shortcuts* conditions* operations*
 * postConditions*`) guarantees every alias is declared before any condition
 * that might reference it, so no source-order tracking is needed here.
 *
 * Previously (through the transpiler-emitter-parity work) func-attached
 * conditions were swept and reported but excluded from the pass/fail
 * assertion, because `validateAttr`/`attrAccessExpr` (src/expr/
 * transpiler.ts) only consulted `attributeTypes`, never `localBindings` —
 * a real bug in `ts-emitter.ts`'s emitted func output (not just a gate
 * limitation): an alias reference inside `exists`/`is absent`/etc. always
 * fell through to the unknown-attribute DIAGNOSTIC, and `emitFuncBody` also
 * emitted pre-conditions before aliases (a TDZ `ReferenceError` on the
 * alias's `const` binding once the DIAGNOSTIC gap was closed). Both are
 * fixed; the 3 real corpus findings (`Create_Exercise.OptionPayoutExists`,
 * `Create_OnDemandRateChangePriceChangeInstruction.OneRatePrice`,
 * `Create_OnDemandInterestPaymentPrimitiveInstruction.
 * InterestRatePayoutExists` — all `<alias> exists` referencing a func-scope
 * alias) are gone; this gate now asserts zero for both surfaces.
 *
 * Separately asserts zero RosettaSuperCall occurrences across BOTH Data and
 * func conditions (per spec: if `super` appears in a real condition, that's
 * a design escalation, not something to route around silently).
 *
 * Data-extends-Choice (`BasketConstituent extends Observable`, where
 * `Observable` is a `Choice`, not a `Data`): `buildAttributeTypesMap`
 * (packages/codegen/src/emit/base-namespace-emitter.ts) now walks through a
 * Choice supertype and contributes its option names as pseudo-attributes —
 * see the design doc at docs/superpowers/specs/2026-07-02-data-extends-
 * choice-design.md. `BasketConstituent.BasketsOfBaskets` (`Basket is
 * absent`) resolves cleanly as a result; no exception needed for it anymore.
 *
 * Per CLAUDE.md: `.resources/`-guarded via `describe.skipIf(!RESOURCES_EXIST)`.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import { AstUtils } from 'langium';
import {
  parseWorkspace,
  isData,
  isRosettaFunction,
  isRosettaModel,
  type Condition,
  type Data,
  type RosettaFunction,
  type RosettaModel
} from '@rune-langium/core';
import { transpileCondition, type ExpressionTranspilerContext } from '../../src/expr/transpiler.js';
import { buildAttributeTypesMap } from '../../src/emit/base-namespace-emitter.js';
import type { GeneratorDiagnostic } from '../../src/types.js';

/**
 * Build the func-scope name-resolution context a real
 * `RosettaFunction`-attached Condition (pre/post-condition) needs: its
 * `attributeTypes` (inputs + output, mirroring ts-emitter's
 * `buildFuncBodyContext`) and its `localBindings` (alias/shortcut names —
 * `RosettaFunction.shortcuts`). The grammar (rune-dsl.langium's
 * `RosettaFunction` rule: `shortcuts* conditions* operations*
 * postConditions*`) guarantees aliases are declared before any condition
 * that might reference them, so every alias is always in scope here
 * regardless of which condition is being transpiled.
 *
 * Deliberately NOT a call into `extractFuncs`/`buildFuncBodyContext`
 * (ts-emitter.ts) — those build a FULL `RuneFunc` (assignments, call
 * graph, output-accumulator kind) for real body emission, which this
 * gate doesn't need; only the name-resolution maps matter for validating
 * that `exists`/`is absent`/`one-of`/`choice`/`only-exists` references
 * resolve. Kept minimal and local to this file, matching how
 * `buildAttributeTypesMap` (imported above) already provides the
 * Data-side equivalent for this same gate.
 */
function buildFuncAttributeContext(func: RosettaFunction): {
  attributeTypes: Map<string, string>;
  localBindings: Map<string, string>;
} {
  const attributeTypes = new Map<string, string>();
  for (const input of func.inputs) {
    attributeTypes.set(input.name, input.typeCall?.type?.$refText ?? 'unknown');
  }
  if (func.output) {
    attributeTypes.set(func.output.name, func.output.typeCall?.type?.$refText ?? 'unknown');
  }

  const localBindings = new Map<string, string>();
  for (const shortcut of func.shortcuts) {
    localBindings.set(shortcut.name, shortcut.name);
  }

  return { attributeTypes, localBindings };
}

const RESOURCES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../.resources');
const RESOURCES_EXIST = existsSync(RESOURCES_DIR);

/** Recursively collect every `.rosetta` file path under `dir`. */
function collectRosettaFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectRosettaFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.rosetta')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Group `.rosetta` files by their top-level `.resources/<corpus>/` directory
 * (e.g. `cdm`, `rune-fpml`) and parse each group as ONE `parseWorkspace()`
 * call. Cross-references (e.g. `type Foo extends Bar` where `Bar` lives in a
 * different file) only resolve when all documents of a corpus are built
 * together — `parse()`'s single-document build (used by the sibling
 * expression-corpus-sweep.test.ts, which doesn't need cross-file type
 * resolution) leaves `superType.ref` unresolved for cross-file inheritance,
 * which would make `buildAttributeTypesMap` (a walk of the `extends` chain
 * via `superType.ref`) silently under-report inherited attributes as
 * "unknown" — a gate-harness artifact, not a real transpiler/emitter gap.
 */
function groupFilesByCorpus(files: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const file of files) {
    const rel = file.slice(RESOURCES_DIR.length + 1);
    const corpus = rel.split('/')[0]!;
    const list = groups.get(corpus) ?? [];
    list.push(file);
    groups.set(corpus, list);
  }
  return groups;
}

interface Finding {
  typeName: string;
  conditionName: string;
  snippet: string;
  diagnosticText: string;
}

/**
 * KNOWN, DOCUMENTED exceptions to the Data-condition DIAGNOSTIC assertion.
 * Each entry names exactly one `TypeName.ConditionName` pair; adding to this
 * list is a deliberate, visible act, not a silent catch-all skip. Empty as
 * of the Data-extends-Choice fix (see file header) — kept as an explicit,
 * visible extension point rather than removed outright.
 */
const KNOWN_DATA_CONDITION_EXCEPTIONS = new Set<string>([]);

interface GateResult {
  fileCount: number;
  skippedCount: number;
  conditionCount: number;
  dataConditionCount: number;
  funcConditionCount: number;
  /** DIAGNOSTIC findings for Data-attached conditions — asserted at zero. */
  dataDiagnosticFindings: Finding[];
  /** DIAGNOSTIC findings for func-attached (pre/post-condition) conditions — asserted at zero. */
  funcDiagnosticFindings: Finding[];
  /** Data-attached findings matched against KNOWN_DATA_CONDITION_EXCEPTIONS — reported, not asserted. */
  knownExceptionFindings: Finding[];
  superFindings: Array<{ typeName: string; conditionName: string; snippet: string }>;
}

/**
 * Walk the corpus (grouped into per-corpus workspaces so cross-file `extends`
 * references resolve), transpile every Condition.expression under a neutral
 * zod-refine context, and collect DIAGNOSTIC / super() occurrences.
 */
async function sweepConditions(): Promise<GateResult> {
  const files = collectRosettaFiles(RESOURCES_DIR);
  const groups = groupFilesByCorpus(files);
  let skippedCount = 0;
  let conditionCount = 0;
  let dataConditionCount = 0;
  let funcConditionCount = 0;
  const dataDiagnosticFindings: Finding[] = [];
  const funcDiagnosticFindings: Finding[] = [];
  const knownExceptionFindings: Finding[] = [];
  const superFindings: GateResult['superFindings'] = [];

  for (const [, groupFiles] of groups) {
    const entries = groupFiles.map((file) => ({
      uri: pathToFileURL(file).toString(),
      content: readFileSync(file, 'utf-8')
    }));
    // parseWorkspace requires ALL documents up front — a corpus with a
    // handful of genuinely-broken files would otherwise fail the whole
    // group. Every corpus under .resources/ parses cleanly today (verified
    // empirically — 0 files skipped once grouped this way vs. 4 skipped
    // under the old per-file parse() harness, which turned out to be a
    // build-ordering artifact of single-document builds, not real syntax
    // errors), so this is a plain forEach rather than a per-file try/catch.
    const results = await parseWorkspace(entries);

    for (const result of results) {
      if (result.hasErrors) {
        skippedCount++;
        continue;
      }
      const model = result.value as RosettaModel;
      if (!isRosettaModel(model)) continue;

      for (const node of AstUtils.streamAllContents(model as unknown as { $type: string } & object)) {
        const n = node as { $type?: string };
        if (n.$type !== 'Condition') continue;
        const cond = node as unknown as {
          name?: string;
          expression?: unknown;
          $container: unknown;
          $cstNode?: { text?: string };
        };
        if (!cond.expression) continue;
        conditionCount++;

        const container = cond.$container;
        const isDataCondition = isData(container as never);
        const typeName = isDataCondition
          ? (container as Data).name
          : ((container as { name?: string })?.name ?? 'UnknownFunc');
        const conditionName = cond.name ?? 'Condition';
        if (isDataCondition) dataConditionCount++;
        else funcConditionCount++;

        // Func-attached conditions resolve names against the func's own
        // scope (inputs/output/aliases), NOT the Data-centric attribute map
        // — see buildFuncAttributeContext's doc comment. A Condition's
        // $container can also be a RosettaTypeAlias (with-condition type
        // aliases) — neither Data- nor func-scoped; falls back to an empty
        // context, same as before this fix (unchanged behavior for that case).
        const { attributeTypes, localBindings } = isDataCondition
          ? { attributeTypes: buildAttributeTypesMap(container as Data), localBindings: undefined }
          : isRosettaFunction(container)
            ? buildFuncAttributeContext(container)
            : { attributeTypes: new Map<string, string>(), localBindings: undefined };

        const diagnostics: GeneratorDiagnostic[] = [];
        const ctx: ExpressionTranspilerContext = {
          selfName: 'data',
          emitMode: 'zod-refine',
          conditionName,
          typeName,
          attributeTypes,
          diagnostics,
          localBindings
        };

        // Use transpileCondition (not transpileExpression directly) — this
        // is the actual dispatcher zod-emitter/ts-emitter call for
        // conditions; it special-cases OneOfOperation/ChoiceOperation/
        // exists/absent/only-exists BEFORE falling through to the generic
        // expression transpiler, so calling transpileExpression directly
        // here would report false-positive DIAGNOSTIC findings for those
        // already-handled Phase 4 cases.
        const out = transpileCondition(node as unknown as Condition, ctx);
        const snippet = cond.$cstNode?.text?.trim() ?? '<no CST text>';

        if (out.includes('DIAGNOSTIC')) {
          const finding: Finding = { typeName, conditionName, snippet, diagnosticText: out };
          if (!isDataCondition) {
            funcDiagnosticFindings.push(finding);
          } else if (KNOWN_DATA_CONDITION_EXCEPTIONS.has(`${typeName}.${conditionName}`)) {
            knownExceptionFindings.push(finding);
          } else {
            dataDiagnosticFindings.push(finding);
          }
        }
        if (out.includes('super() is not supported') || /\bsuper\b/.test(snippet)) {
          superFindings.push({ typeName, conditionName, snippet });
        }
      }
    }
  }

  return {
    fileCount: files.length,
    skippedCount,
    conditionCount,
    dataConditionCount,
    funcConditionCount,
    dataDiagnosticFindings,
    funcDiagnosticFindings,
    knownExceptionFindings,
    superFindings
  };
}

describe.skipIf(!RESOURCES_EXIST)('condition transpile corpus gate (W1 parity)', () => {
  it('transpiles every Data- and func-attached Condition.expression in .resources/ with zero DIAGNOSTIC fallbacks', async () => {
    const {
      fileCount,
      skippedCount,
      conditionCount,
      dataConditionCount,
      funcConditionCount,
      dataDiagnosticFindings,
      funcDiagnosticFindings,
      knownExceptionFindings,
      superFindings
    } = await sweepConditions();

    expect(fileCount).toBeGreaterThan(100);
    expect(conditionCount).toBeGreaterThan(0);

    // eslint-disable-next-line no-console
    console.log(
      `[condition-transpile-corpus] transpiled ${conditionCount} condition expressions from ${fileCount} files ` +
        `(${skippedCount} files skipped — parse errors): ${dataConditionCount} Data-attached ` +
        `(${dataDiagnosticFindings.length} DIAGNOSTIC finding(s), gated; ${knownExceptionFindings.length} known ` +
        `documented exception(s), see file header), ${funcConditionCount} func-attached ` +
        `(${funcDiagnosticFindings.length} DIAGNOSTIC finding(s), gated); ` +
        `${superFindings.length} super() finding(s) total`
    );

    if (superFindings.length > 0) {
      const lines = [
        `\n${superFindings.length} super() finding(s) in real corpus conditions — this is a design`,
        `escalation per spec (RosettaSuperCall has no referent in a validation-predicate context;`,
        `do not guess semantics here):`
      ];
      for (const f of superFindings.slice(0, 20)) {
        lines.push(`  ${f.typeName}.${f.conditionName}: ${JSON.stringify(f.snippet)}`);
      }
      expect.fail(lines.join('\n'));
    }

    if (dataDiagnosticFindings.length > 0) {
      const lines = [
        `\n${dataDiagnosticFindings.length} DIAGNOSTIC finding(s) on Data-attached conditions ` +
          `(unhandled expression $type in the corpus — this IS the W1 emission surface):`
      ];
      for (const f of dataDiagnosticFindings.slice(0, 30)) {
        lines.push(`  ${f.typeName}.${f.conditionName}: ${JSON.stringify(f.snippet)}\n    -> ${f.diagnosticText}`);
      }
      expect.fail(lines.join('\n'));
    }

    if (funcDiagnosticFindings.length > 0) {
      const lines = [
        `\n${funcDiagnosticFindings.length} DIAGNOSTIC finding(s) on func-attached (pre/post-condition) conditions ` +
          `(unhandled expression $type or unresolved func-scope alias reference in the corpus):`
      ];
      for (const f of funcDiagnosticFindings.slice(0, 30)) {
        lines.push(`  ${f.typeName}.${f.conditionName}: ${JSON.stringify(f.snippet)}\n    -> ${f.diagnosticText}`);
      }
      expect.fail(lines.join('\n'));
    }
  }, 120_000);
});
