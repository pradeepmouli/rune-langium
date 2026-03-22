[**Documentation v0.1.0**](../../../../README.md)

***

[Documentation](../../../../README.md) / [@rune-langium/core](../../README.md) / [zod-schemas](../README.md) / RosettaSynonymBodySchema

# Variable: RosettaSynonymBodySchema

> `const` **RosettaSynonymBodySchema**: `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaSynonymBody"`\>; `format`: `ZodOptional`\<`ZodString`\>; `hints`: `ZodOptional`\<`ZodArray`\<`ZodString`\>\>; `mapper`: `ZodOptional`\<`ZodString`\>; `mappingLogic`: `ZodOptional`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaMapping"`\>; `instances`: `ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaMappingInstance"`\>; `default`: `ZodOptional`\<`ZodBoolean`\>; `set`: `ZodOptional`\<`ZodLazy`\<`ZodDiscriminatedUnion`\<..., ...\>\>\>; `when`: `ZodOptional`\<`ZodObject`\<\{ `$type`: ...; `tests`: ...; \}, `$loose`\>\>; \}, `$loose`\>\>; \}, `$loose`\>\>; `merge`: `ZodOptional`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaMergeSynonymValue"`\>; `excludePath`: `ZodOptional`\<`ZodString`\>; `name`: `ZodString`; \}, `$loose`\>\>; `metaValues`: `ZodOptional`\<`ZodArray`\<`ZodString`\>\>; `patternMatch`: `ZodOptional`\<`ZodString`\>; `patternReplace`: `ZodOptional`\<`ZodString`\>; `removeHtml`: `ZodOptional`\<`ZodBoolean`\>; `values`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaSynonymValueBase"`\>; `maps`: `ZodOptional`\<`ZodNumber`\>; `name`: `ZodString`; `path`: `ZodOptional`\<`ZodString`\>; `refType`: `ZodOptional`\<`ZodUnion`\<readonly \[`ZodLiteral`\<`"tag"`\>, `ZodLiteral`\<`"componentID"`\>\]\>\>; `value`: `ZodOptional`\<`ZodNumber`\>; \}, `$loose`\>\>\>; \}, `$loose`\>

Defined in: [packages/core/src/generated/zod-schemas.ts:146](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/zod-schemas.ts#L146)
