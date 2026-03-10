import { describe, it } from 'vitest';
import { createRuneDslServices } from '../../src/index.js';
import { URI } from 'langium';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../../../..');
const RESOURCES = resolve(ROOT, '.resources');
const HAS_RESOURCES = existsSync(resolve(RESOURCES, 'cdm'));

// CI uses .resources/rune-dsl/, local dev uses .resources/rune-dsl-src/rune-runtime/src/main/resources/model/
const BUILTIN_DIR = existsSync(resolve(RESOURCES, 'rune-dsl'))
  ? resolve(RESOURCES, 'rune-dsl')
  : resolve(RESOURCES, 'rune-dsl-src/rune-runtime/src/main/resources/model');

describe('CDM deep diagnostic', () => {
  it.skipIf(!HAS_RESOURCES)(
    'identifies specific unresolved names',
    async () => {
      const { RuneDsl } = createRuneDslServices();
      const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
      const builder = RuneDsl.shared.workspace.DocumentBuilder;

      const load = (dir: string, prefix: string) =>
        readdirSync(dir)
          .filter((f) => f.endsWith('.rosetta'))
          .map((f) => ({
            uri: `inmemory:///${prefix}/${f}`,
            content: readFileSync(resolve(dir, f), 'utf8')
          }));

      const allEntries = [
        ...['basictypes.rosetta', 'annotations.rosetta'].map((f) => ({
          uri: `inmemory:///com.rosetta.model/${f}`,
          content: readFileSync(resolve(BUILTIN_DIR, f), 'utf8')
        })),
        ...load(resolve(ROOT, '.resources/cdm'), 'cdm'),
        ...load(resolve(ROOT, '.resources/rune-fpml'), 'fpml')
      ];

      const docs = allEntries.map((e) => factory.fromString(e.content, URI.parse(e.uri)));
      await builder.build(docs, { validation: true });

      // Tally unresolved names by reference type
      const unresolved: Record<string, Map<string, number>> = {};
      let total = 0;
      for (const doc of docs) {
        for (const d of (doc.diagnostics ?? []).filter((x) => x.severity === 1)) {
          const m = d.message.match(/Could not resolve reference to (\w+) named '(.+)'/);
          if (m) {
            const [, refType, name] = m;
            if (!unresolved[refType]) unresolved[refType] = new Map();
            unresolved[refType].set(name, (unresolved[refType].get(name) ?? 0) + 1);
            total++;
          }
        }
      }

      for (const [refType, names] of Object.entries(unresolved)) {
        const top = [...names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
        console.log(
          `\n${refType} (${[...names.values()].reduce((a, b) => a + b, 0)} errors, ${names.size} distinct):`
        );
        top.forEach(([n, c]) => console.log(`  ${String(c).padStart(5)}  ${n}`));
      }
      console.log(`\nTotal linking errors: ${total}`);

      // Count all diagnostics by severity
      let allDiags = 0;
      const bySeverity: Record<number, number> = {};
      const diagMessages: Record<string, number> = {};
      for (const doc of docs) {
        for (const d of doc.diagnostics ?? []) {
          allDiags++;
          bySeverity[d.severity ?? 0] = (bySeverity[d.severity ?? 0] ?? 0) + 1;
          const msgKey = d.message.substring(0, 80);
          diagMessages[msgKey] = (diagMessages[msgKey] ?? 0) + 1;
        }
      }
      console.log(`Total diagnostics (all severities): ${allDiags}`);
      for (const [sev, count] of Object.entries(bySeverity)) {
        const label =
          sev === '1' ? 'error' : sev === '2' ? 'warning' : sev === '3' ? 'info' : `sev${sev}`;
        console.log(`  ${label}: ${count}`);
      }

      // Show top diagnostic messages
      const topMsgs = Object.entries(diagMessages)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30);
      console.log(`\nTop diagnostic messages:`);
      for (const [msg, count] of topMsgs) {
        console.log(`  ${String(count).padStart(5)}  ${msg}`);
      }

      // Show all unique diagnostics with file+line for investigation
      console.log(`\n--- All diagnostics by file ---`);
      for (const doc of docs) {
        const diags = doc.diagnostics ?? [];
        if (diags.length > 0) {
          console.log(`\n${doc.uri.path} (${diags.length}):`);
          for (const d of diags) {
            const sev = d.severity === 1 ? 'ERR' : d.severity === 2 ? 'WRN' : 'INF';
            console.log(`  [${sev}] L${d.range.start.line + 1}: ${d.message.substring(0, 150)}`);
          }
        }
      }
    },
    120000
  );
});
