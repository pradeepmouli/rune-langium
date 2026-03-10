import { createRuneDslServices } from './dist/index.js';
import { URI } from 'langium';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const cwd = new URL('.', import.meta.url).pathname;
const cdmDir = join(cwd, '../../.resources/cdm');
const runtimeDir = join(cwd, '../../.resources/rune-dsl-src/rune-runtime/src/main/resources/model');
const cdmFiles = readdirSync(cdmDir).filter(f => f.endsWith('.rosetta'));
const runtimeFiles = readdirSync(runtimeDir).filter(f => f.endsWith('.rosetta'));

const { RuneDsl } = createRuneDslServices();
const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
const builder = RuneDsl.shared.workspace.DocumentBuilder;

// Load runtime files first (with file:// URIs)
const runtimeDocs = runtimeFiles.map(f => {
  const path = join(runtimeDir, f);
  const content = readFileSync(path, 'utf8');
  const uri = URI.file(path);
  return factory.fromString(content, uri);
});

const cdmDocs = cdmFiles.map(f => {
  const path = join(cdmDir, f);
  const content = readFileSync(path, 'utf8');
  const uri = URI.file(path);
  return factory.fromString(content, uri);
});

await builder.build([...runtimeDocs, ...cdmDocs], { validation: true });

let totalErrors = 0, totalWarnings = 0;
const msgCounts = {};
const fileCounts = [];

for (const doc of cdmDocs) {  // Only count CDM errors
  const diags = doc.diagnostics ?? [];
  const errors = diags.filter(d => d.severity === 1);
  const warnings = diags.filter(d => d.severity === 2);
  totalErrors += errors.length;
  totalWarnings += warnings.length;
  if (diags.length > 0) {
    fileCounts.push({ file: doc.uri.path.split('/').pop(), errors: errors.length, warnings: warnings.length });
  }
  for (const d of diags) {
    const msg = d.message.replace(/'[^']*'/g, "'X'");
    msgCounts[msg] = (msgCounts[msg] || 0) + 1;
  }
}

console.log(`Total CDM errors (with runtime): ${totalErrors}`);
console.log(`Total CDM warnings (with runtime): ${totalWarnings}`);
console.log('\nTop 25 message patterns:');
Object.entries(msgCounts)
  .sort((a,b) => b[1]-a[1])
  .slice(0, 25)
  .forEach(([msg, cnt]) => console.log(`  ${String(cnt).padStart(5)}  ${msg.slice(0,110)}`));

console.log('\nFiles with most diagnostics:');
fileCounts.sort((a,b) => (b.errors+b.warnings)-(a.errors+a.warnings)).slice(0,10)
  .forEach(f => console.log(`  ${f.file}: ${f.errors} errors, ${f.warnings} warnings`));
