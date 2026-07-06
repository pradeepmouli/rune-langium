// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * The `rune-codegen import` action body (specs/021-codegen-inbound).
 *
 * Kept in its own module, separate from `bin/rune-codegen.ts` — mirrors
 * `packages/cli/src/parse.ts`/`validate.ts`/`generate.ts`'s convention of a
 * thin commander `.action(...)` wrapper in the bin entry point delegating to
 * an exported, directly-unit-testable function in `src/`. This split is not
 * cosmetic: `bin/rune-codegen.ts` calls `program.parseAsync(process.argv)`
 * unconditionally at module load, so importing THAT file from a test would
 * parse the test runner's own argv as CLI input. Importing `runImport` from
 * here instead has no such side effect.
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { importModel, type ImportSourceKind } from './index.js';

export interface ImportCommandOptions {
  from: string;
  outFile?: string;
  namespace?: string;
  synonyms: boolean;
  conditions: boolean;
  onUntranslatable: string;
  /** `--from sql` only (spec.md `--sql-dialect`). */
  sqlDialect?: string;
}

export async function runImport(input: string, cmdOpts: ImportCommandOptions): Promise<number> {
  try {
    const source = await readFile(resolve(input), 'utf-8');
    const result = await importModel(source, {
      from: cmdOpts.from as ImportSourceKind,
      ...(cmdOpts.namespace !== undefined && { namespace: cmdOpts.namespace }),
      synonyms: cmdOpts.synonyms,
      conditions: cmdOpts.conditions,
      onUntranslatable: cmdOpts.onUntranslatable as 'stub' | 'skip' | 'error',
      ...(cmdOpts.sqlDialect !== undefined && { sqlDialect: cmdOpts.sqlDialect as 'postgres' | 'sqlserver' })
    });

    for (const d of result.diagnostics) {
      const prefix = d.severity === 'error' ? 'error' : d.severity;
      process.stderr.write(`rune-codegen import: ${prefix} [${d.code}]\n  ${d.message}\n`);
    }

    if (cmdOpts.outFile) {
      const outPath = resolve(cmdOpts.outFile);
      await mkdir(outPath.replace(/[^/\\]+$/, ''), { recursive: true });
      await writeFile(outPath, result.text, 'utf-8');
      process.stdout.write(`rune-codegen import: wrote ${outPath}\n`);
    } else {
      process.stdout.write(result.text);
    }

    return result.diagnostics.some((d) => d.severity === 'error') ? 1 : 0;
  } catch (err: unknown) {
    process.stderr.write(`rune-codegen import: error: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}
