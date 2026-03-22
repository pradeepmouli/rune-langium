# Classes

## `CodegenServiceProxy`
Proxy that spawns the codegen CLI subprocess for each request.
The CLI reads JSON from stdin (--json mode) and writes JSON to stdout.
```ts
constructor(cliPath?: string): CodegenServiceProxy
```
**Methods:**
- `generate(request: CodeGenerationRequest, signal?: AbortSignal): Promise<CodeGenerationResult>` — Generate code from .rosetta model files.
- `listLanguages(): Promise<{ id: string; class: string }[]>` — List available code generators.
- `isAvailable(): Promise<boolean>` — Check if the codegen CLI is available and runnable.
- `serve(port: number): Server` — Start an HTTP server that proxies requests to the codegen CLI.
Exposes: GET /api/health, GET /api/languages, POST /api/generate
