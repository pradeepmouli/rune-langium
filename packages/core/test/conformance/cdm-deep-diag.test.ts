import { describe, it } from 'vitest';
import { createRuneDslServices } from '../../src/index.js';
import { URI } from 'langium';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../../../..');

describe('CDM deep diagnostic', () => {
  it('identifies specific unresolved names', async () => {
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
        content: readFileSync(
          resolve(ROOT, '.resources/rune-dsl-src/rune-runtime/src/main/resources/model', f),
          'utf8'
        )
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

    // Extra: show first 5 files/lines for specific names to diagnose
    for (const targetName of [
      'Lowest',
      'InterestRateIndex',
      'quantity',
      'value',
      'priceQuantity'
    ]) {
      console.log(`\n--- '${targetName}' errors (first 5) ---`);
      let count = 0;
      for (const doc of docs) {
        for (const d of (doc.diagnostics ?? []).filter((x) => x.severity === 1)) {
          if (d.message.includes(`'${targetName}'`) && count < 5) {
            console.log(
              doc.uri.path,
              'line',
              d.range.start.line + 1,
              '-',
              d.message.substring(0, 100)
            );
            count++;
          }
        }
      }
    }
  }, 120000);
});
