import { createRuneDslServices } from './dist/index.js';
import { URI } from 'langium';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const cwd = new URL('.', import.meta.url).pathname;
const cdmDir = join(cwd, '../../.resources/cdm');
const files = readdirSync(cdmDir).filter(f => f.endsWith('.rosetta'));

const { RuneDsl } = createRuneDslServices();
const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
const builder = RuneDsl.shared.workspace.DocumentBuilder;

const docs = files.map(f => {
  const path = join(cdmDir, f);
  const content = readFileSync(path, 'utf8');
  const uri = URI.file(path);
  return factory.fromString(content, uri);
});

await builder.build(docs, { validation: true });

// Show all 'units' errors with context
console.log('=== errors mentioning "units" ===');
for (const doc of docs) {
  for (const d of (doc.diagnostics ?? [])) {
    if (d.message.includes('units')) {
      const lines = readFileSync(doc.uri.fsPath, 'utf8').split('\n');
      const line = d.range.start.line;
      console.log(`\n${doc.uri.path.split('/').pop()}:${line+1}: ${d.message}`);
      console.log(`  context: ${lines[line]?.trim()}`);
    }
  }
}

// Show Duplicate element errors
console.log('\n=== Duplicate element errors ===');
for (const doc of docs) {
  for (const d of (doc.diagnostics ?? [])) {
    if (d.message.startsWith('Duplicate element')) {
      console.log(`${doc.uri.path.split('/').pop()}: ${d.message}`);
    }
  }
}

// Count annotation errors by annotation name
console.log('\n=== Unresolved Annotation names ===');
const annots = {};
for (const doc of docs) {
  for (const d of (doc.diagnostics ?? [])) {
    if (d.message.includes('Annotation named')) {
      const m = d.message.match(/'([^']+)'/);
      if (m) annots[m[1]] = (annots[m[1]] || 0) + 1;
    }
  }
}
Object.entries(annots).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(`  ${v} ${k}`));

// Count unresolved RosettaType names
console.log('\n=== Unresolved RosettaType names (top 20) ===');
const types = {};
for (const doc of docs) {
  for (const d of (doc.diagnostics ?? [])) {
    if (d.message.includes('RosettaType named')) {
      const m = d.message.match(/'([^']+)'/);
      if (m) types[m[1]] = (types[m[1]] || 0) + 1;
    }
  }
}
Object.entries(types).sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([k,v]) => console.log(`  ${v} ${k}`));
