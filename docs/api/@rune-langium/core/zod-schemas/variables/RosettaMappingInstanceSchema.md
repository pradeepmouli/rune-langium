[**Documentation v0.1.0**](../../../../README.md)

***

[Documentation](../../../../README.md) / [@rune-langium/core](../../README.md) / [zod-schemas](../README.md) / RosettaMappingInstanceSchema

# Variable: RosettaMappingInstanceSchema

> `const` **RosettaMappingInstanceSchema**: `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaMappingInstance"`\>; `default`: `ZodOptional`\<`ZodBoolean`\>; `set`: `ZodOptional`\<`ZodLazy`\<`ZodDiscriminatedUnion`\<\[`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaEnumValueReference"`\>; `enumeration`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<...\>; \}, `$loose`\>; `value`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<...\>; \}, `$loose`\>; \}, `$loose`\>, `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaMapTestExistsExpression"`\>; `argument`: `ZodObject`\<\{ `$type`: `ZodLiteral`\<...\>; `path`: `ZodString`; \}, `$loose`\>; \}, `$loose`\>, `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaMapTestAbsentExpression"`\>; `argument`: `ZodObject`\<\{ `$type`: `ZodLiteral`\<...\>; `path`: `ZodString`; \}, `$loose`\>; \}, `$loose`\>, `any`, `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaMapPathValue"`\>; `path`: `ZodString`; \}, `$loose`\>\], `"$type"`\>\>\>; `when`: `ZodOptional`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaMappingPathTests"`\>; `tests`: `ZodArray`\<`ZodLazy`\<`ZodDiscriminatedUnion`\<\[`ZodObject`\<\{ `$type`: ...; `path`: ...; \}, `$loose`\>, `ZodObject`\<\{ `$type`: ...; `path`: ...; \}, `$loose`\>, `ZodObject`\<\{ `$type`: ...; `func`: ...; `predicatePath`: ...; \}, `$loose`\>\], `"$type"`\>\>\>; \}, `$loose`\>\>; \}, `$loose`\>

Defined in: [packages/core/src/generated/zod-schemas.ts:125](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/core/src/generated/zod-schemas.ts#L125)
