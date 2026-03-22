[**Documentation v0.1.0**](../../../../README.md)

***

[Documentation](../../../../README.md) / [@rune-langium/codegen](../../README.md) / [node](../README.md) / CodegenServiceProxy

# Class: CodegenServiceProxy

Defined in: [codegen-service.ts:26](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/codegen/src/codegen-service.ts#L26)

Proxy that spawns the codegen CLI subprocess for each request.
The CLI reads JSON from stdin (--json mode) and writes JSON to stdout.

## Constructors

### Constructor

> **new CodegenServiceProxy**(`cliPath?`): `CodegenServiceProxy`

Defined in: [codegen-service.ts:29](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/codegen/src/codegen-service.ts#L29)

#### Parameters

##### cliPath?

`string`

#### Returns

`CodegenServiceProxy`

## Methods

### generate()

> **generate**(`request`, `signal?`): `Promise`\<[`CodeGenerationResult`](../../interfaces/CodeGenerationResult.md)\>

Defined in: [codegen-service.ts:39](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/codegen/src/codegen-service.ts#L39)

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

Defined in: [codegen-service.ts:63](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/codegen/src/codegen-service.ts#L63)

Check if the codegen CLI is available and runnable.

#### Returns

`Promise`\<`boolean`\>

***

### listLanguages()

> **listLanguages**(): `Promise`\<`object`[]\>

Defined in: [codegen-service.ts:55](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/codegen/src/codegen-service.ts#L55)

List available code generators.

#### Returns

`Promise`\<`object`[]\>

***

### serve()

> **serve**(`port?`): `Server`

Defined in: [codegen-service.ts:77](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/codegen/src/codegen-service.ts#L77)

Start an HTTP server that proxies requests to the codegen CLI.
Exposes: GET /api/health, GET /api/languages, POST /api/generate

#### Parameters

##### port?

`number` = `8377`

#### Returns

`Server`
