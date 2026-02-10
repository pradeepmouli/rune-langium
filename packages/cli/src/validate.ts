import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import type { LangiumDocument } from 'langium';
import type { RosettaModel } from '@rune-langium/core';

export interface ValidateCommandOptions {
  json?: boolean;
}

/**
 * Discover `.rosetta` files from a list of file/directory paths.
 */
async function discoverFiles(paths: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const p of paths) {
    const resolved = resolve(p);
    const s = await stat(resolved);
    if (s.isDirectory()) {
      const entries = await readdir(resolved, { recursive: true });
      for (const entry of entries) {
        if (extname(entry) === '.rosetta') {
          files.push(resolve(resolved, entry));
        }
      }
    } else if (extname(resolved) === '.rosetta') {
      files.push(resolved);
    }
  }
  return files;
}

/**
 * Validate one or more Rosetta DSL files and report diagnostics.
 */
export async function runValidate(
  paths: string[],
  options: ValidateCommandOptions
): Promise<number> {
  const files = await discoverFiles(paths);
  if (files.length === 0) {
    console.error('No .rosetta files found.');
    return 1;
  }

  const { RuneDsl } = createRuneDslServices();
  const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
  const builder = RuneDsl.shared.workspace.DocumentBuilder;

  const documents: LangiumDocument[] = [];
  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const doc = factory.fromString(content, URI.file(file));
    documents.push(doc);
  }

  await builder.build(documents, { validation: true });

  let hasErrors = false;
  const results: Array<{
    file: string;
    diagnostics: Array<{ severity: string; message: string; line: number }>;
  }> = [];

  for (const doc of documents) {
    const filePath = relative(process.cwd(), doc.uri.fsPath);
    const diagnostics = (doc.diagnostics ?? []).map((d) => ({
      severity: d.severity === 1 ? 'error' : d.severity === 2 ? 'warning' : 'info',
      message: d.message,
      line: (d.range.start.line ?? 0) + 1
    }));

    const errors = diagnostics.filter((d) => d.severity === 'error');
    if (errors.length > 0) hasErrors = true;

    results.push({ file: filePath, diagnostics });
  }

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) {
      if (r.diagnostics.length === 0) {
        console.log(`${r.file}: OK`);
      } else {
        for (const d of r.diagnostics) {
          const prefix =
            d.severity === 'error' ? 'ERROR' : d.severity === 'warning' ? 'WARN' : 'INFO';
          console.log(`${r.file}:${d.line}: [${prefix}] ${d.message}`);
        }
      }
    }
  }

  return hasErrors ? 1 : 0;
}
