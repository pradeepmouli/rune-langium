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
 * SCOPE NOTE: this gate asserts zero DIAGNOSTIC only for conditions whose
 * `$container` is a `Data` type — this is the actual W1 emission surface
 * (`ts-emitter.emitData` / `zod-emitter`'s per-Data condition block).
 * Conditions attached to a `RosettaFunction` (func pre/post-conditions) are
 * SWEPT AND REPORTED but excluded from the pass/fail assertion: their real
 * `attributeTypes` come from `func.inputs`/`func.output`/alias bindings
 * (see `ts-emitter.ts`'s `buildFuncBodyContext`), which requires the same
 * `RuneFunc`/`extractFuncs` machinery as func-body emission itself — not
 * "cheaply reachable" from a corpus sweep without re-implementing that
 * extraction in parallel. Per the plan: "attempt func-body expressions if
 * cheaply reachable; report whether included or deferred and why" — this
 * gate DEFERS full func-condition attribute modeling for that reason and
 * documents it in the parity report rather than asserting on a known-
 * incomplete model (false positives would misrepresent the real W1 gap).
 *
 * Separately asserts zero RosettaSuperCall occurrences across BOTH Data and
 * func conditions (per spec: if `super` appears in a real condition, that's
 * a design escalation, not something to route around silently).
 *
 * KNOWN EXCEPTION (documented, not fixed here — genuinely out of this plan's
 * scope): `BasketConstituent.BasketsOfBaskets` (`Basket is absent`) is
 * excluded from the assertion. `BasketConstituent extends Observable`, and
 * `Observable` is a `Choice` (not a `Data` type) whose options are `Asset`,
 * `Basket`, `Index` — Rune's type system treats extending a Choice as
 * inheriting its option names as pseudo-attributes, which
 * `buildAttributeTypesMap` (walks `Data.superType.ref` — only ever a `Data`)
 * has never modeled. This is a DIFFERENT feature from W2's Choice-as-
 * attribute-type support (the spec's Choice section only covers
 * `isChoice(typeRef) → typeRef.name` for attributes TYPED BY a Choice, not
 * `extends`-ing one) — raised here as a corpus finding, not silently
 * special-cased into looking like a pass.
 *
 * Per CLAUDE.md: `.resources/`-guarded via `describe.skipIf(!RESOURCES_EXIST)`.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import { AstUtils } from 'langium';
import { parseWorkspace, isData, isRosettaModel, type Condition, type Data, type RosettaModel } from '@rune-langium/core';
import { transpileCondition, type ExpressionTranspilerContext } from '../../src/expr/transpiler.js';
import { buildAttributeTypesMap } from '../../src/emit/base-namespace-emitter.js';
import type { GeneratorDiagnostic } from '../../src/types.js';

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
 * KNOWN, DOCUMENTED exceptions to the Data-condition DIAGNOSTIC assertion —
 * see the file-header "KNOWN EXCEPTION" note. Each entry names exactly one
 * `TypeName.ConditionName` pair; adding to this list is a deliberate,
 * visible act, not a silent catch-all skip.
 */
const KNOWN_DATA_CONDITION_EXCEPTIONS = new Set(['BasketConstituent.BasketsOfBaskets']);

interface GateResult {
  fileCount: number;
  skippedCount: number;
  conditionCount: number;
  dataConditionCount: number;
  funcConditionCount: number;
  /** DIAGNOSTIC findings for Data-attached conditions — the gate's pass/fail surface. */
  dataDiagnosticFindings: Finding[];
  /** DIAGNOSTIC findings for func-attached (pre/post-condition) conditions — reported, not asserted (see file header). */
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
        const attributeTypes = isDataCondition ? buildAttributeTypesMap(container as Data) : new Map();
        const conditionName = cond.name ?? 'Condition';
        if (isDataCondition) dataConditionCount++;
        else funcConditionCount++;

        const diagnostics: GeneratorDiagnostic[] = [];
        const ctx: ExpressionTranspilerContext = {
          selfName: 'data',
          emitMode: 'zod-refine',
          conditionName,
          typeName,
          attributeTypes,
          diagnostics
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
  it(
    'transpiles every Data-attached Condition.expression in .resources/ with zero DIAGNOSTIC fallbacks',
    async () => {
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
          `(${funcDiagnosticFindings.length} DIAGNOSTIC finding(s), reported/deferred — see file header); ` +
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
          lines.push(
            `  ${f.typeName}.${f.conditionName}: ${JSON.stringify(f.snippet)}\n    -> ${f.diagnosticText}`
          );
        }
        expect.fail(lines.join('\n'));
      }

      // func-attached findings are NOT asserted (see file header) but are
      // still surfaced in the console log above for visibility; do not
      // silently drop them.
      if (funcDiagnosticFindings.length > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `[condition-transpile-corpus] func-attached DIAGNOSTIC findings (deferred, not gated):\n` +
            funcDiagnosticFindings
              .slice(0, 30)
              .map((f) => `  ${f.typeName}.${f.conditionName}: ${JSON.stringify(f.snippet)}\n    -> ${f.diagnosticText}`)
              .join('\n')
        );
      }
    },
    120_000
  );
});
