[**Documentation v0.1.0**](../../../../README.md)

***

[Documentation](../../../../README.md) / [@rune-langium/core](../../README.md) / [zod-schemas](../README.md) / SwitchOperationSchema

# Variable: SwitchOperationSchema

> `const` **SwitchOperationSchema**: `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"SwitchOperation"`\>; `argument`: `ZodOptional`\<`ZodLazy`\<`any`\>\>; `cases`: `ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"SwitchCaseOrDefault"`\>; `expression`: `ZodLazy`\<`any`\>; `guard`: `ZodOptional`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"SwitchCaseGuard"`\>; `literalGuard`: `ZodOptional`\<`ZodLazy`\<`ZodDiscriminatedUnion`\<..., ...\>\>\>; `referenceGuard`: `ZodOptional`\<`ZodObject`\<\{ `$refText`: ...; `ref`: ...; \}, `$loose`\>\>; \}, `$loose`\>\>; \}, `$loose`\>\>; `operator`: `ZodLiteral`\<`"switch"`\>; \}, `$loose`\>

Defined in: [packages/core/src/generated/zod-schemas.ts:867](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/zod-schemas.ts#L867)
