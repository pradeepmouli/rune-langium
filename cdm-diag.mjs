import { createRuneDslServices } from './packages/core/dist/index.js';
import { URI } from 'langium';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const cdmDir = './.resources/cdm';
const files = readdirSync(cdmDir).filter(f => f.endsWith('.rosetta'));

const { RuneDsl } = createRuneDslServices();
const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
const builder = RuneDsl.shared.workspace.DocumentBuilder;

const docs = files.map(f => {
  const path = join(process.cwd(), cdmDir, f);
  const content = readFileSync(path, 'utf8');
  const uri = URI.file(path);
  return factory.fromString(content, uri);
});

await builder.build(docs, { validation: true });

let totalErrors = 0, totalWarnings = 0;
const msgCounts = {};
const fileCounts = [];

for (const doc of docs) {
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

console.log(`Total errors: ${totalErrors}`);
console.log(`Total warnings: ${totalWarnings}`);
console.log('\nTop message patterns:');
Object.entries(msgCounts)
  .sort((a,b) => b[1]-a[1])
  .slice(0, 25)
  .forEach(([msg, cnt]) => console.log(`  ${String(cnt).padStart(5)}  ${msg.slice(0,110)}`));

console.log('\nFiles with most diagnostics:');
fileCounts.sort((a,b) => (b.errors+b.warnings)-(a.errors+a.warnings)).slice(0,15)
  .forEach(f => console.log(`  ${f.file}: ${f.errors} errors, ${f.warnings} warnings`));
