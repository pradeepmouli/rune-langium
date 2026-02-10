# Project Structure & Packaging: Xtext to Langium

## Monorepo Layout

A typical ported DSL uses a monorepo with core and CLI packages:

```
dsl-langium/
  packages/
    core/                                  # @dsl-langium/core
      src/
        grammar/
          dsl.langium                      # Langium grammar (main artifact)
        generated/
          ast.ts                           # Auto-generated AST types
          grammar.ts                       # Auto-generated grammar access
          module.ts                        # Auto-generated module
        services/
          dsl-module.ts                    # Custom service bindings (DI)
          dsl-validator.ts                 # Validation rules
          dsl-scope-provider.ts            # Custom scoping
          dsl-type-provider.ts             # Type computation
        utils/
          cardinality-utils.ts             # Computed property utilities
          expression-utils.ts              # Expression helpers
        api/
          parse.ts                         # parse() and parseWorkspace()
          types.ts                         # Public API type re-exports
        worker/
          parser-worker.ts                 # Web worker helper (optional)
        index.ts                           # Package entry point
      tests/
        grammar/
          expressions.test.ts              # Expression parsing tests
          data-types.test.ts               # Data/Choice/Enum tests
          functions.test.ts                # Function parsing tests
        scoping/
          scope-provider.test.ts           # Cross-reference resolution
        validation/
          expression-validator.test.ts     # Expression validation
          type-validator.test.ts           # Type validation
        conformance/
          corpus.test.ts                   # Full corpus parse conformance
          round-trip.test.ts               # Serialization round-trip
        performance/
          parse-benchmark.test.ts          # Latency benchmarks
        api/
          parse-api.test.ts                # Public API tests
        fixtures/
          corpus/                           # Vendored test corpus (excluded from npm)
          dsl-source/                       # Vendored source grammar (excluded from npm)
      langium-config.json                  # Langium CLI configuration
      tsconfig.json
      tsup.config.ts
      package.json
    cli/                                   # @dsl-langium/cli
      src/
        index.ts                           # CLI entry point (parse, validate)
      package.json
  scripts/
    update-fixtures.sh                     # Refresh vendored snapshots
  tsconfig.json                            # Root tsconfig
  package.json                             # Workspace root
```

## Langium Configuration

```json
// langium-config.json
{
  "$schema": "https://langium.org/schemas/langium-config.schema.json",
  "projectName": "RuneDsl",
  "languages": [
    {
      "id": "rune-dsl",
      "grammar": "src/grammar/rune-dsl.langium",
      "fileExtensions": [".rosetta"],
      "textMate": {
        "out": "syntaxes/rune-dsl.tmLanguage.json"
      }
    }
  ],
  "out": "src/generated",
  "chevrotainParserConfig": {
    "recoveryEnabled": true,
    "maxLookahead": 3
  }
}
```

Key settings:
- `recoveryEnabled: true` - Produce partial ASTs on syntax errors
- `maxLookahead: 3` - Start conservative; increase per-rule if needed
- `out: "src/generated"` - Generated files alongside source

## Build Configuration

### tsup (Dual CJS/ESM)

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2020',
    external: ['langium', 'chevrotain'],
    splitting: false,
    treeshake: true,
});
```

### TypeScript Configuration

```json
// packages/core/tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/generated/**/*.ts"]
}
```

### Package.json Exports

```json
{
  "name": "@dsl-langium/core",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.cjs",
  "module": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist", "src/grammar"],
  "sideEffects": false,
  "scripts": {
    "generate": "langium generate",
    "build": "npm run generate && tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:conformance": "vitest run --reporter=verbose tests/conformance/",
    "lint": "eslint src/"
  },
  "dependencies": {
    "langium": "^4.2.0"
  },
  "devDependencies": {
    "langium-cli": "^4.2.0",
    "vitest": "^2.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.5.0"
  }
}
```

**Critical**: The `files` field excludes `tests/fixtures/` from the published package.

## Test Fixture Strategy

### Vendored Snapshots

Vendor test corpus and source grammar as in-repo snapshots:

```bash
#!/bin/bash
# scripts/update-fixtures.sh
# Adapt these URLs and paths to your DSL's source grammar and test corpus repositories.

FIXTURES_DIR="packages/core/tests/fixtures"

# Test corpus
echo "Updating test corpus..."
git clone --depth 1 --branch v7.0.0 \
    https://github.com/finos/common-domain-model.git \
    /tmp/cdm-snapshot
cp -r /tmp/cdm-snapshot/rosetta-source/ "$FIXTURES_DIR/cdm/"
rm -rf /tmp/cdm-snapshot

# Source grammar
echo "Updating source grammar..."
git clone --depth 1 \
    https://github.com/finos/rune-dsl.git \
    /tmp/rune-dsl-snapshot
cp -r /tmp/rune-dsl-snapshot/rune-lang/ "$FIXTURES_DIR/rune-dsl/"
rm -rf /tmp/rune-dsl-snapshot

echo "Fixtures updated."
```

### Fixture Loader

```typescript
// tests/helpers/fixture-loader.ts
import { readdirSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

export function loadCorpusFiles(extension: string = '.rosetta'): Map<string, string> {
    const files = new Map<string, string>();
    function walk(dir: string) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) walk(path);
            else if (extname(entry.name) === extension) {
                files.set(path, readFileSync(path, 'utf-8'));
            }
        }
    }
    walk(join(FIXTURES_DIR, 'cdm'));
    return files;
}
```

### .gitignore

```gitignore
# Exclude large vendored fixtures from git LFS or ignore entirely
# (depends on project policy)

# Exclude from npm publish (handled by package.json "files" field)
# No .npmignore needed if "files" is correctly set
```

## Custom Module Setup (Dependency Injection)

Langium uses dependency injection to wire services:

```typescript
// services/dsl-module.ts
import { Module, inject } from 'langium';
import type { LangiumServices, PartialLangiumServices } from 'langium/lsp';

export type RuneAddedServices = {
    validation: {
        RuneValidator: RuneValidator;
    };
    references: {
        RuneScopeProvider: RuneScopeProvider;
    };
    types: {
        RuneTypeProvider: RuneTypeProvider;
    };
};

export type RuneServices = LangiumServices & RuneAddedServices;

export const RuneModule: Module<RuneServices, PartialLangiumServices & RuneAddedServices> = {
    validation: {
        RuneValidator: (services) => new RuneValidator(services),
    },
    references: {
        ScopeProvider: (services) => new RuneScopeProvider(services),
    },
    types: {
        RuneTypeProvider: (services) => new RuneTypeProvider(services),
    },
};
```

## Public API Design

```typescript
// api/parse.ts
import { createRuneServices } from '../services/rune-dsl-module.js';

export interface ParseResult {
    ast: RosettaModel;
    diagnostics: Diagnostic[];
    document: LangiumDocument;
}

export interface WorkspaceResult {
    documents: Map<string, ParseResult>;
    diagnostics: Map<string, Diagnostic[]>;
}

export async function parse(source: string): Promise<ParseResult> {
    const services = createRuneServices();
    const document = await services.shared.workspace.DocumentBuilder.build(
        services.shared.workspace.LangiumDocumentFactory.fromString(source, URI.parse('memory://input.rosetta'))
    );
    return {
        ast: document.parseResult.value as RosettaModel,
        diagnostics: document.diagnostics ?? [],
        document,
    };
}

export async function parseWorkspace(files: Map<string, string>): Promise<WorkspaceResult> {
    const services = createRuneServices();
    const documents = new Map<string, ParseResult>();

    for (const [path, content] of files) {
        const uri = URI.file(path);
        services.shared.workspace.LangiumDocuments.addDocument(
            services.shared.workspace.LangiumDocumentFactory.fromString(content, uri)
        );
    }

    await services.shared.workspace.DocumentBuilder.build(
        Array.from(services.shared.workspace.LangiumDocuments.all)
    );

    for (const doc of services.shared.workspace.LangiumDocuments.all) {
        documents.set(doc.uri.path, {
            ast: doc.parseResult.value as RosettaModel,
            diagnostics: doc.diagnostics ?? [],
            document: doc,
        });
    }

    return {
        documents,
        diagnostics: new Map(
            Array.from(documents).map(([k, v]) => [k, v.diagnostics])
        ),
    };
}
```

## CLI Package

```typescript
// packages/cli/src/index.ts
import { Command } from 'commander';
import { parse, parseWorkspace } from '@dsl-langium/core';
import { globSync } from 'glob';
import { readFileSync } from 'node:fs';

const program = new Command();

program
    .name('dsl-langium')
    .description('Parse and validate DSL files')
    .version('0.1.0');

program
    .command('parse <files...>')
    .description('Parse DSL files and output AST summary')
    .option('--json', 'Output structured JSON')
    .action(async (files: string[], options) => {
        const resolved = files.flatMap(f => globSync(f));
        for (const file of resolved) {
            const source = readFileSync(file, 'utf-8');
            const result = await parse(source);
            if (options.json) {
                console.log(JSON.stringify(result.ast, null, 2));
            } else {
                console.log(`${file}: ${result.diagnostics.length} diagnostics`);
            }
        }
    });

program
    .command('validate <files...>')
    .description('Validate DSL files')
    .option('--json', 'Output structured JSON diagnostics')
    .action(async (files: string[], options) => {
        const resolved = files.flatMap(f => globSync(f));
        const fileMap = new Map(resolved.map(f => [f, readFileSync(f, 'utf-8')]));
        const result = await parseWorkspace(fileMap);

        let hasErrors = false;
        for (const [file, diags] of result.diagnostics) {
            for (const d of diags) {
                if (d.severity === 'error') hasErrors = true;
                if (options.json) {
                    console.log(JSON.stringify({ file, ...d }));
                } else {
                    console.log(`${file}:${d.range.start.line}:${d.range.start.character}: ${d.severity}: ${d.message}`);
                }
            }
        }

        process.exit(hasErrors ? 1 : 0);
    });

program.parse();
```

## Performance Benchmarks

```typescript
// tests/performance/parse-benchmark.test.ts
import { describe, test, expect } from 'vitest';
import { parse, parseWorkspace } from '../../src/api/parse.js';
import { loadCorpusFiles } from '../helpers/fixture-loader.js';

describe('performance', () => {
    test('single file parse < 200ms', async () => {
        const source = '...'; // representative file
        const start = performance.now();
        await parse(source);
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(200);
    });

    test('full corpus parse < 5s', async () => {
        const files = loadCorpusFiles();
        const start = performance.now();
        await parseWorkspace(files);
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(5000);
    });
});
```

## Browser Compatibility

Ensure no Node.js-only APIs leak into the core package:

- Use `langium` and `chevrotain` (both pure JS)
- Avoid `fs`, `path`, `process` in core package (CLI only)
- Use `URI` from langium instead of `path.resolve`
- Provide a web worker helper as optional export

```typescript
// worker/parser-worker.ts
export function createWorkerParser(): Worker {
    return new Worker(
        new URL('./parser-worker-impl.js', import.meta.url),
        { type: 'module' }
    );
}
```

## CI Configuration

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run generate
      - run: npm run lint
      - run: npm run build
      - run: npm test
      - run: npm run test:conformance
```
