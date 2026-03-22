[**Documentation v0.1.0**](../../../../README.md)

***

[Documentation](../../../../README.md) / [@rune-langium/core](../../README.md) / [zod-schemas](../README.md) / RosettaMappingPathTestsSchema

# Variable: RosettaMappingPathTestsSchema

> `const` **RosettaMappingPathTestsSchema**: `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaMappingPathTests"`\>; `tests`: `ZodArray`\<`ZodLazy`\<`ZodDiscriminatedUnion`\<\[`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaMapPath"`\>; `path`: `ZodObject`\<\{ `$type`: `ZodLiteral`\<...\>; `path`: `ZodString`; \}, `$loose`\>; \}, `$loose`\>, `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaMapRosettaPath"`\>; `path`: `ZodObject`\<\{ `$type`: `ZodLiteral`\<...\>; `attribute`: `ZodObject`\<..., ...\>; `receiver`: `ZodObject`\<..., ...\>; \}, `$loose`\>; \}, `$loose`\>, `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaMapTestFunc"`\>; `func`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<...\>; \}, `$loose`\>; `predicatePath`: `ZodOptional`\<`ZodObject`\<\{ `$type`: ...; `path`: ...; \}, `$loose`\>\>; \}, `$loose`\>\], `"$type"`\>\>\>; \}, `$loose`\>

Defined in: [packages/core/src/generated/zod-schemas.ts:120](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/zod-schemas.ts#L120)
