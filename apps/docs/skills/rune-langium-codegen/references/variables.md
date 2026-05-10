# Variables & Constants

## helpers

### `RUNTIME_HELPER_JS_SOURCE`
Plain JavaScript equivalent of `RUNTIME_HELPER_SOURCE` — no type annotations.

Used by the Studio codegen worker when executing generated functions in a
sandboxed Function constructor. Since the worker strips TypeScript annotations
from the isolated function body (`GeneratedFunc.fileContents`), the helpers
also need to be annotation-free so no TypeScript constructs reach the JS engine.
```ts
const RUNTIME_HELPER_JS_SOURCE: string
```
