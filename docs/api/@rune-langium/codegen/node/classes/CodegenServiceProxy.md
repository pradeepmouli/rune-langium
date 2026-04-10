[**Documentation v0.1.0**](../../../../README.md)

***

[Documentation](../../../../README.md) / [@rune-langium/codegen](../../README.md) / [node](../README.md) / CodegenServiceProxy

# Class: CodegenServiceProxy

Defined in: [codegen-service.ts:29](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/codegen/src/codegen-service.ts#L29)

Proxy that spawns the codegen CLI subprocess for each request.
The CLI reads JSON from stdin (--json mode) and writes JSON to stdout.

## Constructors

### Constructor

> **new CodegenServiceProxy**(`cliPath?`): `CodegenServiceProxy`

Defined in: [codegen-service.ts:32](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/codegen/src/codegen-service.ts#L32)

#### Parameters

##### cliPath?

`string`

#### Returns

`CodegenServiceProxy`

## Methods

### generate()

> **generate**(`request`, `signal?`): `Promise`\<[`CodeGenerationResult`](../../interfaces/CodeGenerationResult.md)\>

Defined in: [codegen-service.ts:42](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/codegen/src/codegen-service.ts#L42)

Generate code from .rosetta model files.

#### Parameters

##### request

[`CodeGenerationRequest`](../../interfaces/CodeGenerationRequest.md)

##### signal?

`AbortSignal`

#### Returns

`Promise`\<[`CodeGenerationResult`](../../interfaces/CodeGenerationResult.md)\>

***

### isAvailable()

> **isAvailable**(): `Promise`\<`boolean`\>

Defined in: [codegen-service.ts:66](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/codegen/src/codegen-service.ts#L66)

Check if the codegen CLI is available and runnable.

#### Returns

`Promise`\<`boolean`\>

***

### listLanguages()

> **listLanguages**(): `Promise`\<`object`[]\>

Defined in: [codegen-service.ts:58](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/codegen/src/codegen-service.ts#L58)

List available code generators.

#### Returns

`Promise`\<`object`[]\>

***

### serve()

> **serve**(`port?`): `Server`

Defined in: [codegen-service.ts:80](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/codegen/src/codegen-service.ts#L80)

Start an HTTP server that proxies requests to the codegen CLI.
Exposes: GET /api/health, GET /api/languages, POST /api/generate

#### Parameters

##### port?

`number` = `8377`

#### Returns

`Server`
