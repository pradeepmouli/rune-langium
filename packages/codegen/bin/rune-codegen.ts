#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * rune-codegen CLI entry point.
 *
 * Implements the CLI contract from specs/015-rune-codegen-zod/contracts/cli.md.
 * Accepts <input...> file or directory paths, parses them with the Rune Langium
 * service, and emits code to the --output directory.
 *
 * Tasks: T041–T043 (Phase 3, US1).
 * FR-001, FR-015, FR-016, FR-025, SC-001.
 */

import { readFile, readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { watch } from 'node:fs';
import process from 'node:process';
import { Command } from 'commander';
import { URI } from 'langium';
import { createRuneDslServices } from '@rune-langium/core';
import { generate } from '../src/index.js';
import type { Target, GeneratorDiagnostic, GeneratorOutput } from '../src/types.js';
import { importModel, type ImportSourceKind } from '../src/import/index.js';

// ---- package version --------------------------------------------------------

// Resolved at build time via import.meta (Node 22+) or fallback
const PKG_VERSION = '0.1.0';

// ---- helpers ----------------------------------------------------------------

/**
 * Recursively find all .rune files under a path (file or directory).
 */
async function findRuneFiles(inputPath: string): Promise<string[]> {
  let s;
  try {
    s = await stat(inputPath);
  } catch {
    throw new Error(`Input path not found: ${inputPath}`);
  }

  if (s.isFile()) {
    if (extname(inputPath) !== '.rune') {
      throw new Error(`Input file is not a .rune file: ${inputPath}`);
    }
    return [inputPath];
  }

  if (s.isDirectory()) {
    const results: string[] = [];
    await collectRuneFiles(inputPath, results);
    return results;
  }

  throw new Error(`Input path is neither a file nor a directory: ${inputPath}`);
}

async function collectRuneFiles(dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectRuneFiles(fullPath, out);
    } else if (entry.isFile() && entry.name.endsWith('.rune')) {
      out.push(fullPath);
    }
  }
}

/**
 * Parse a .rune file and return the Langium document.
 */
async function parseRuneFile(
  filePath: string,
  services: ReturnType<typeof createRuneDslServices>
): Promise<import('langium').LangiumDocument> {
  const content = await readFile(filePath, 'utf-8');
  // Use .rosetta URI so the Langium service registry recognizes the extension
  const fileName = filePath.replace(/\.rune$/, '.rosetta').replace(/.*[/\\]/, '');
  const doc = services.RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    content,
    URI.parse(`inmemory:///${fileName}`)
  );
  await services.RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  return doc;
}

/**
 * Write a single GeneratorOutput to disk.
 */
async function writeOutput(output: GeneratorOutput, outputDir: string): Promise<void> {
  const outPath = join(outputDir, output.relativePath);
  const outDir = outPath.replace(/[^/\\]+$/, '');
  await mkdir(outDir, { recursive: true });
  await writeFile(outPath, output.content, 'utf-8');
}

/**
 * Format a timestamp for watch mode output: [HH:MM:SS]
 */
function timestamp(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

/**
 * Aggregate diagnostics across all outputs (deduped by sourceUri+line+char+code).
 */
function aggregateDiagnostics(outputs: GeneratorOutput[]): GeneratorDiagnostic[] {
  const seen = new Set<string>();
  const all: GeneratorDiagnostic[] = [];
  for (const o of outputs) {
    for (const d of o.diagnostics) {
      const key = `${d.sourceUri ?? ''}:${d.line ?? 0}:${d.char ?? 0}:${d.code}`;
      if (!seen.has(key)) {
        seen.add(key);
        all.push(d);
      }
    }
  }
  return all;
}

/**
 * Print a diagnostic to stderr.
 */
function printDiagnostic(d: GeneratorDiagnostic): void {
  const loc = d.sourceUri
    ? `${d.sourceUri}${d.line != null ? `:${d.line}` : ''}${d.char != null ? `:${d.char}` : ''} `
    : '';
  const prefix = d.severity === 'error' ? 'error' : d.severity;
  process.stderr.write(`rune-codegen: ${prefix} in ${loc}[${d.code}]\n  ${d.message}\n`);
}

// ---- core generate-and-write ------------------------------------------------

interface RunOptions {
  target: Target;
  outputDir: string;
  strict: boolean;
  json: boolean;
}

interface RunResult {
  success: boolean;
  durationMs: number;
  outputs: GeneratorOutput[];
  diagnostics: GeneratorDiagnostic[];
}

async function runOnce(
  files: string[],
  services: ReturnType<typeof createRuneDslServices>,
  opts: RunOptions
): Promise<RunResult> {
  const start = Date.now();

  // Parse all files
  const docs = await Promise.all(files.map((f) => parseRuneFile(f, services)));

  // Generate
  let outputs: GeneratorOutput[];
  try {
    outputs = await generate(docs, { target: opts.target, strict: opts.strict });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - start;
    const diag: GeneratorDiagnostic = {
      severity: 'error',
      message,
      code: 'generator-error'
    };
    return { success: false, durationMs, outputs: [], diagnostics: [diag] };
  }

  const allDiags = aggregateDiagnostics(outputs);
  const hasErrors = allDiags.some((d) => d.severity === 'error');

  // Write outputs (skip if strict and errors)
  if (!opts.strict || !hasErrors) {
    await Promise.all(outputs.map((o) => writeOutput(o, opts.outputDir)));
  }

  const durationMs = Date.now() - start;
  return {
    success: !hasErrors,
    durationMs,
    outputs,
    diagnostics: allDiags
  };
}

// ---- output formatters ------------------------------------------------------

function printHumanProgress(result: RunResult, opts: RunOptions): void {
  const { outputs, diagnostics, durationMs, success } = result;
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warnCount = diagnostics.filter((d) => d.severity === 'warning').length;

  process.stdout.write(`rune-codegen: generating '${opts.target}' for ${outputs.length} document(s)...\n`);
  for (const o of outputs) {
    process.stdout.write(`  ✓ ${o.relativePath}\n`);
  }
  for (const d of diagnostics) {
    printDiagnostic(d);
  }
  process.stdout.write(
    `rune-codegen: ${success ? 'done' : 'failed'} (${errorCount} error(s), ${warnCount} warning(s)) in ${(durationMs / 1000).toFixed(2)}s\n`
  );
}

function printJsonOutput(result: RunResult, opts: RunOptions): void {
  const payload = {
    target: opts.target,
    durationMs: result.durationMs,
    files: result.outputs.map((o) => ({
      relativePath: o.relativePath,
      diagnostics: o.diagnostics
    })),
    diagnostics: result.diagnostics,
    success: result.success
  };
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
}

// ---- watch mode -------------------------------------------------------------

const DEBOUNCE_MS = 200;

async function runWatch(
  files: string[],
  services: ReturnType<typeof createRuneDslServices>,
  opts: RunOptions
): Promise<void> {
  const inputPaths = [...new Set(files.map((f) => resolve(f).replace(/[^/\\]+\.rune$/, '')))];

  process.stdout.write(`rune-codegen: watching ${inputPaths.join(', ')} for changes...\n`);

  // Initial generation
  const initial = await runOnce(files, services, opts);
  if (opts.json) {
    printJsonOutput(initial, opts);
  } else {
    printHumanProgress(initial, opts);
  }

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  // Watch each unique directory
  for (const dir of inputPaths) {
    watch(dir, { recursive: true }, (_event, filename) => {
      if (!filename || !String(filename).endsWith('.rune')) return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const ts = timestamp();
        process.stdout.write(`[${ts}] change detected: ${filename}\n`);

        // Re-create services for clean parse state
        const freshServices = createRuneDslServices();
        const result = await runOnce(files, freshServices, opts);

        if (opts.json) {
          printJsonOutput(result, opts);
        } else {
          const prefix = `[${ts}] `;
          process.stdout.write(
            `${prefix}rune-codegen: generating '${opts.target}' for ${result.outputs.length} document(s)...\n`
          );
          for (const o of result.outputs) {
            process.stdout.write(`  ✓ ${o.relativePath}\n`);
          }
          for (const d of result.diagnostics) {
            printDiagnostic(d);
          }
          const errorCount = result.diagnostics.filter((d) => d.severity === 'error').length;
          process.stdout.write(
            `${prefix}rune-codegen: ${result.success ? 'done' : 'failed'} (${errorCount} error(s)) in ${(result.durationMs / 1000).toFixed(2)}s\n`
          );
        }
      }, DEBOUNCE_MS);
    });
  }

  // Wait for SIGINT / SIGTERM
  await new Promise<void>((resolve) => {
    const cleanup = (): void => {
      clearTimeout(debounceTimer);
      process.stdout.write('rune-codegen: stopped.\n');
      resolve();
    };
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
  });
}

// ---- import (inbound) subcommand --------------------------------------------

/**
 * `rune-codegen import` — inbound generation (specs/021-codegen-inbound).
 *
 * NOT registered as a commander subcommand on the same root `Command` as the
 * default (outbound) action: verified empirically that once a `Command` has
 * ANY registered subcommand, commander rejects an unrecognized bare
 * positional argument to the root program as `error: unknown command
 * '<path>'` — i.e. adding `import` as a `program.command('import')` sibling
 * breaks the existing `rune-codegen file.rune -t zod` invocation entirely
 * (reproduced with a minimal commander-only repro, independent of this
 * file's own logic). `isDefault: true` doesn't help either — it only makes
 * one NAMED subcommand the default, it can't fall back to a root-level
 * inline `.argument()` handler.
 *
 * Instead, `import` is dispatched via its OWN standalone `Command` instance,
 * selected by inspecting `process.argv[2]` before the root program is even
 * constructed (see `main()` below). This keeps the two invocation forms
 * fully independent — no shared `Command` tree, no coexistence hazard.
 */
function buildImportCommand(): Command {
  const importProgram = new Command();
  importProgram
    .name('rune-codegen import')
    .description('Import a .rune model from an external source format (Phase 1: json-schema only)')
    .argument('<input>', 'Path to the source file (e.g. a JSON Schema document)')
    .requiredOption('--from <source>', "Source format: 'json-schema' (only supported value in Phase 1)")
    .option('-o, --output <file>', 'Output .rune file path (default: stdout)')
    .option('--namespace <name>', 'Override namespace derivation')
    .option('--no-synonyms', 'Suppress synonym annotations')
    .option('--no-conditions', 'Structural import only — skip expression translation')
    .option('--on-untranslatable <mode>', "How to handle an untranslatable construct: 'stub' (default)", 'stub')
    .exitOverride()
    .action(
      async (
        input: string,
        cmdOpts: {
          from: string;
          output?: string;
          namespace?: string;
          synonyms: boolean;
          conditions: boolean;
          onUntranslatable: string;
        }
      ) => {
        try {
          const source = await readFile(resolve(input), 'utf-8');
          const result = importModel(source, {
            from: cmdOpts.from as ImportSourceKind,
            ...(cmdOpts.namespace !== undefined && { namespace: cmdOpts.namespace }),
            synonyms: cmdOpts.synonyms,
            conditions: cmdOpts.conditions,
            onUntranslatable: cmdOpts.onUntranslatable as 'stub' | 'skip' | 'error'
          });

          for (const d of result.diagnostics) {
            const prefix = d.severity === 'error' ? 'error' : d.severity;
            process.stderr.write(`rune-codegen import: ${prefix} [${d.code}]\n  ${d.message}\n`);
          }

          if (cmdOpts.output) {
            const outPath = resolve(cmdOpts.output);
            await mkdir(outPath.replace(/[^/\\]+$/, ''), { recursive: true });
            await writeFile(outPath, result.text, 'utf-8');
            process.stdout.write(`rune-codegen import: wrote ${outPath}\n`);
          } else {
            process.stdout.write(result.text);
          }

          const hasErrors = result.diagnostics.some((d) => d.severity === 'error');
          process.exit(hasErrors ? 1 : 0);
        } catch (err: unknown) {
          process.stderr.write(`rune-codegen import: error: ${err instanceof Error ? err.message : String(err)}\n`);
          process.exit(1);
        }
      }
    );
  return importProgram;
}

if (process.argv[2] === 'import') {
  // Standard commander argv shape is [node, script, ...args] — strip the
  // literal 'import' token (index 2) since the standalone import Command's
  // own `.argument('<input>', ...)` starts at what would otherwise be index 3.
  const importArgv = [process.argv[0]!, process.argv[1]!, ...process.argv.slice(3)];
  await buildImportCommand()
    .parseAsync(importArgv)
    .catch((err: unknown) => {
      if (err && typeof err === 'object' && 'exitCode' in err) {
        const exitCode = (err as { exitCode: number }).exitCode;
        process.exit(exitCode === 0 ? 0 : 2);
      }
      process.stderr.write(
        `rune-codegen import: unexpected error: ${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exit(1);
    });
}

// ---- main -------------------------------------------------------------------

const program = new Command();

program
  .name('rune-codegen')
  .description('Generate Zod / JSON Schema / TypeScript from Rune (.rune) models')
  .version(`rune-codegen ${PKG_VERSION}`, '-v, --version')
  .argument('<input...>', 'One or more .rune file paths or directories')
  .option('-t, --target <target>', "Output target: 'zod', 'json-schema', or 'typescript'", 'zod')
  .option('-o, --output <dir>', 'Output directory root', './generated')
  .option('-w, --watch', 'Watch mode: re-generate on file changes')
  .option('--strict', 'Treat any generator error diagnostic as fatal')
  .option('--json', 'Emit machine-readable JSON to stdout instead of human-readable progress')
  .exitOverride(); // Prevent commander from calling process.exit() directly

program
  .parseAsync(process.argv)
  .then(async () => {
    const args = program.args;
    const options = program.opts<{
      target: string;
      output: string;
      watch?: boolean;
      strict?: boolean;
      json?: boolean;
    }>();

    // Validate target
    const validTargets: Target[] = ['zod', 'json-schema', 'typescript'];
    if (!validTargets.includes(options.target as Target)) {
      process.stderr.write(
        `rune-codegen: error: unknown target '${options.target}'. Expected: ${validTargets.join(', ')}.\n`
      );
      process.exit(2);
    }

    const target = options.target as Target;
    const outputDir = resolve(options.output);

    // Collect input files
    let files: string[];
    try {
      const allFiles = await Promise.all(args.map((a) => findRuneFiles(resolve(a))));
      files = allFiles.flat();
    } catch (err: unknown) {
      process.stderr.write(`rune-codegen: error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }

    if (files.length === 0) {
      process.stderr.write('rune-codegen: error: no .rune files found in the given input paths.\n');
      process.exit(1);
    }

    const opts: RunOptions = {
      target,
      outputDir,
      strict: options.strict ?? false,
      json: options.json ?? false
    };

    const services = createRuneDslServices();

    if (options.watch) {
      await runWatch(files, services, opts);
      process.exit(0);
    }

    const result = await runOnce(files, services, opts);

    if (opts.json) {
      printJsonOutput(result, opts);
    } else {
      printHumanProgress(result, opts);
    }

    process.exit(result.success ? 0 : 1);
  })
  .catch((err: unknown) => {
    // commander exitOverride throws CommanderError for --help/--version/usage errors
    if (err && typeof err === 'object' && 'exitCode' in err) {
      const exitCode = (err as { exitCode: number }).exitCode;
      // exitCode 0 = --help or --version (already printed)
      // exitCode non-zero = usage error
      process.exit(exitCode === 0 ? 0 : 2);
    }
    process.stderr.write(`rune-codegen: unexpected error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
