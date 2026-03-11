import { describe, it } from 'vitest';
import { createRuneDslServices } from '../../src/index.js';
import { URI } from 'langium';

describe('Symbol scope in data type conditions', () => {
  it('resolves attribute in data type condition', async () => {
    const { RuneDsl } = createRuneDslServices();
    const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
    const builder = RuneDsl.shared.workspace.DocumentBuilder;

    const docs = [
      factory.fromString(
        `
namespace com.rosetta.model
version "1.0"
basicType string
basicType boolean
typeAlias int(digits int, min int, max int): number(digits: digits, fractionalDigits: 0, min: min, max: max)
basicType number(digits int, fractionalDigits int, min number, max number)
`,
        URI.parse('inmemory:///basictypes.rosetta')
      ),
      factory.fromString(
        `
namespace test
version "1.0"

type NonTransferableProduct:
  economicTerms string (1..1)

type TradableProduct:
  product NonTransferableProduct (1..1)
  adjustment string (0..1)

  condition NotionalAdjustment:
    if adjustment exists
    then product -> economicTerms = "x"
`,
        URI.parse('inmemory:///test.rosetta')
      )
    ];

    await builder.build(docs, { validation: true });
    const errors = (docs[1]!.diagnostics ?? []).filter((x) => x.severity === 1);
    for (const e of errors) console.log('ERROR:', e.message);
    console.log('Errors:', errors.length);
  }, 30000);
});
