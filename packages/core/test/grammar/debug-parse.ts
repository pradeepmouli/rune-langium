import { parse } from '../../src/api/parse.js';

async function main() {
  const tests = [
    { name: 'empty', input: 'namespace test.empty' },
    { name: 'version', input: 'namespace com.example version "1.0.0"' },
    { name: 'type', input: 'namespace test.types\ntype Foo:\n  bar string (1..1)\n' },
    {
      name: 'enum',
      input: 'namespace test.enums\nenum Direction:\n  North\n  South\n  East\n  West\n'
    }
  ];
  for (const t of tests) {
    const r = await parse(t.input);
    console.log('---', t.name, '---');
    console.log('hasErrors:', r.hasErrors);
    if (r.lexerErrors.length > 0)
      console.log('lexerErrors:', JSON.stringify(r.lexerErrors, null, 2));
    if (r.parserErrors.length > 0)
      console.log('parserErrors:', JSON.stringify(r.parserErrors, null, 2));
    console.log('name:', r.value?.name);
    console.log('version:', r.value?.version);
    console.log('elements:', r.value?.elements?.length);
  }
}
main().catch(console.error);
