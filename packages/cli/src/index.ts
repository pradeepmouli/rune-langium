#!/usr/bin/env node
import { Command } from 'commander';
import { runParse } from './parse.js';
import { runValidate } from './validate.js';

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

program.parse();
