import { createRuneDslServices } from './dist/index.js';
import { URI } from 'langium';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const cwd = new URL('.', import.meta.url).pathname;
const cdmDir = join(cwd, '../../.resources/cdm');
const runtimeDir = join(cwd, '../../.resources/rune-dsl-src/rune-runtime/src/main/resources/model');

const { RuneDsl } = createRuneDslServices();
const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
const builder = RuneDsl.shared.workspace.DocumentBuilder;

const runtimeDocs = readdirSync(runtimeDir).filter(f => f.endsWith('.rosetta')).map(f => {
  const path = join(runtimeDir, f);
  return factory.fromString(readFileSync(path, 'utf8'), URI.file(path));
});

const cdmDocs = readdirSync(cdmDir).filter(f => f.endsWith('.rosetta')).map(f => {
  const path = join(cdmDir, f);
  return factory.fromString(readFileSync(path, 'utf8'), URI.file(path));
});

await builder.build([...runtimeDocs, ...cdmDocs], { validation: true });

// Show top unresolved feature names
const featureNames = {};
const symbolNames = {};
const typeNames = {};
for (const doc of cdmDocs) {
  for (const d of (doc.diagnostics ?? [])) {
    const m = d.message.match(/'([^']+)'/);
    if (!m) continue;
    if (d.message.includes('RosettaFeature named')) featureNames[m[1]] = (featureNames[m[1]]||0)+1;
    if (d.message.includes('RosettaSymbol named')) symbolNames[m[1]] = (symbolNames[m[1]]||0)+1;
    if (d.message.includes('RosettaType named')) typeNames[m[1]] = (typeNames[m[1]]||0)+1;
  }
}

console.log('Top 30 unresolved RosettaFeature names:');
Object.entries(featureNames).sort((a,b)=>b[1]-a[1]).slice(0,30)
  .forEach(([k,v]) => console.log(`  ${v} ${k}`));

console.log('\nTop 20 unresolved RosettaSymbol names:');
Object.entries(symbolNames).sort((a,b)=>b[1]-a[1]).slice(0,20)
  .forEach(([k,v]) => console.log(`  ${v} ${k}`));

console.log('\nTop 20 unresolved RosettaType names:');
Object.entries(typeNames).sort((a,b)=>b[1]-a[1]).slice(0,20)
  .forEach(([k,v]) => console.log(`  ${v} ${k}`));

// Show some RosettaFeature errors with their context
console.log('\n--- Sample RosettaFeature errors with context ---');
let shown = 0;
for (const doc of cdmDocs) {
  if (shown >= 20) break;
  const fname = doc.uri.path.split('/').pop();
  const lines = readFileSync(doc.uri.fsPath, 'utf8').split('\n');
  for (const d of (doc.diagnostics ?? [])) {
    if (d.message.includes('RosettaFeature named') && shown < 20) {
      const line = d.range.start.line;
      console.log(`${fname}:${line+1}: ${d.message}`);
      console.log(`  ${lines[line]?.trim()}`);
      shown++;
    }
  }
}
