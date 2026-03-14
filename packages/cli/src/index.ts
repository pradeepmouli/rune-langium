#!/usr/bin/env node
import { Command } from 'commander';
import { runParse } from './parse.js';
import { runValidate } from './validate.js';
import { runGenerate } from './generate.js';
import type { GenerateCommandOptions } from './generate.js';

const program = new Command();

program.name('rune-dsl').description('CLI tools for the Rune DSL').version('0.1.0');

program
  .command('parse')
  .description('Parse Rosetta DSL files and report syntax errors')
  .argument('<paths...>', 'Files or directories to parse')
  .option('--json', 'Output results as JSON')
  .action(async (paths: string[], options: { json?: boolean }) => {
    const exitCode = await runParse(paths, options);
    process.exit(exitCode);
  });

program
  .command('validate')
  .description('Validate Rosetta DSL files and report diagnostics')
  .argument('<paths...>', 'Files or directories to validate')
  .option('--json', 'Output results as JSON')
  .action(async (paths: string[], options: { json?: boolean }) => {
    const exitCode = await runValidate(paths, options);
    process.exit(exitCode);
  });

program
  .command('generate')
  .description('Generate code from Rosetta DSL files via rosetta-code-generators')
  .requiredOption('-l, --language <lang>', 'Target language (e.g., java, scala, typescript)')
  .requiredOption('-i, --input <paths...>', '.rosetta file paths or directories')
  .requiredOption('-o, --output <dir>', 'Output directory for generated code')
  .option('-r, --reference <paths...>', 'Reference model paths (compilation context, not exported)')
  .option(
    '--codegen-jar <path>',
    'Path to rosetta-code-generators JAR (or set RUNE_CODEGEN_JAR env var)'
  )
  .option('--generator-opts <json>', 'JSON string of generator-specific options')
  .option('--list-languages', 'List available code generators and exit')
  .option('--json', 'Output results as JSON')
  .action(async (options: GenerateCommandOptions) => {
    const exitCode = await runGenerate(options);
    process.exit(exitCode);
  });

program.parse();
