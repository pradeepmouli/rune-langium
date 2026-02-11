import { createRuneDslServices } from '../packages/core/dist/index.js';
import { URI } from 'langium';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const services = createRuneDslServices().RuneDsl;
const cdmDir = path.join(rootDir, '.resources/cdm');
const files = fs.readdirSync(cdmDir).filter((f) => f.endsWith('.rosetta'));

for (const f of files) {
  const text = fs.readFileSync(path.join(cdmDir, f), 'utf-8');
  const doc = services.shared.workspace.LangiumDocumentFactory.fromString(
    text,
    URI.file(`/tmp/${f}`)
  );
  services.shared.workspace.LangiumDocuments.addDocument(doc);
}

const allDocs = Array.from(services.shared.workspace.LangiumDocuments.all);
await services.shared.workspace.DocumentBuilder.build(allDocs, {
  validation: false
});

const errMap = {};
for (const doc of services.shared.workspace.LangiumDocuments.all) {
  const errs = doc.parseResult.parserErrors;
  if (errs.length > 0) {
    const name = path.basename(doc.uri.path);
    const msgs = [...new Set(errs.map((e) => e.message.slice(0, 150)))];
    errMap[name] = msgs.slice(0, 5);
  }
}

// Group by error pattern
const patterns = {};
for (const [file, msgs] of Object.entries(errMap)) {
  for (const msg of msgs) {
    const key = msg.slice(0, 100);
    if (!patterns[key]) patterns[key] = [];
    patterns[key].push(file);
  }
}

// Sort by count
const sorted = Object.entries(patterns).sort((a, b) => b[1].length - a[1].length);
console.log('\n=== Error Patterns (by frequency) ===\n');
for (const [pattern, pFiles] of sorted.slice(0, 25)) {
  console.log(`[${pFiles.length} files] ${pattern}`);
  console.log(`  e.g., ${pFiles.slice(0, 3).join(', ')}`);
}
console.log(`\nTotal failing: ${Object.keys(errMap).length}/${files.length}`);

// Also show a few full error messages for the most common pattern
const topPattern = sorted[0];
if (topPattern) {
  const topFile = topPattern[1][0];
  console.log(`\n=== Full errors for ${topFile} ===`);
  for (const msg of errMap[topFile]) {
    console.log(`  ${msg}`);
  }
}
