# Examples

This directory contains examples demonstrating how to use packages in this monorepo. Update the
imports to match the packages you create under [packages/](../packages).

## Root Module

```typescript
import { hello } from '../src/index';

console.log(hello());
```

## Package Usage (Example)

```typescript
import { parseRune } from '@rune-langium/example-package';

const ast = parseRune('data example');
console.log(ast);
```

## Cross-Package Integration (Example)

```typescript
import { parseRune } from '@rune-langium/core';
import { formatDiagnostics } from '@rune-langium/utils';

const diagnostics = parseRune('data example');
console.log(formatDiagnostics(diagnostics));
```
    return createSuccessResponse(data);
  } catch (error) {
    // Retry with exponential backoff
    await delay(1000);

    try {
      const response = await fetch(url);
      const data = await response.json();
      return createSuccessResponse(data);
    } catch {
      return createErrorResponse('Failed to fetch data');
    }
  }
}
```

## Running Examples

All examples are part of the test suite:

```bash
# Run integration tests with examples
pnpm run test integration.test.ts

# Run specific example
pnpm run test -- --grep "should process user data"

# Watch examples as you edit
pnpm run test:watch -- integration.test.ts
```

## More Information

- [Core Package](../packages/core/README.md)
- [Utils Package](../packages/utils/README.md)
- [Test Utils Package](../packages/test-utils/README.md)
- [Workspace Guide](./WORKSPACE.md)
- [Testing Guide](./TESTING.md)
- [Development Workflow](./DEVELOPMENT.md)
