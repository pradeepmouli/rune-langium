[**Documentation v0.1.0**](../../../../README.md)

***

[Documentation](../../../../README.md) / [@rune-langium/core](../../README.md) / [zod-schemas](../README.md) / RosettaMappingPathTestsSchema

# Variable: RosettaMappingPathTestsSchema

> `const` **RosettaMappingPathTestsSchema**: `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaMappingPathTests"`\>; `tests`: `ZodArray`\<`ZodLazy`\<`ZodDiscriminatedUnion`\<\[`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaMapPath"`\>; `path`: `ZodObject`\<\{ `$type`: `ZodLiteral`\<...\>; `path`: `ZodString`; \}, `$loose`\>; \}, `$loose`\>, `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaMapRosettaPath"`\>; `path`: `ZodObject`\<\{ `$type`: `ZodLiteral`\<...\>; `attribute`: `ZodObject`\<..., ...\>; `receiver`: `ZodObject`\<..., ...\>; \}, `$loose`\>; \}, `$loose`\>, `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaMapTestFunc"`\>; `func`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<...\>; \}, `$loose`\>; `predicatePath`: `ZodOptional`\<`ZodObject`\<\{ `$type`: ...; `path`: ...; \}, `$loose`\>\>; \}, `$loose`\>\], `"$type"`\>\>\>; \}, `$loose`\>

Defined in: [packages/core/src/generated/zod-schemas.ts:120](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/core/src/generated/zod-schemas.ts#L120)
