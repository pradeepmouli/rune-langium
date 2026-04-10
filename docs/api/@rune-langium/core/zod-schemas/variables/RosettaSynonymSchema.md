[**Documentation v0.1.0**](../../../../README.md)

***

[Documentation](../../../../README.md) / [@rune-langium/core](../../README.md) / [zod-schemas](../README.md) / RosettaSynonymSchema

# Variable: RosettaSynonymSchema

> `const` **RosettaSynonymSchema**: `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaSynonym"`\>; `body`: `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaSynonymBody"`\>; `format`: `ZodOptional`\<`ZodString`\>; `hints`: `ZodOptional`\<`ZodArray`\<`ZodString`\>\>; `mapper`: `ZodOptional`\<`ZodString`\>; `mappingLogic`: `ZodOptional`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaMapping"`\>; `instances`: `ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<...\>; `default`: `ZodOptional`\<...\>; `set`: `ZodOptional`\<...\>; `when`: `ZodOptional`\<...\>; \}, `$loose`\>\>; \}, `$loose`\>\>; `merge`: `ZodOptional`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaMergeSynonymValue"`\>; `excludePath`: `ZodOptional`\<`ZodString`\>; `name`: `ZodString`; \}, `$loose`\>\>; `metaValues`: `ZodOptional`\<`ZodArray`\<`ZodString`\>\>; `patternMatch`: `ZodOptional`\<`ZodString`\>; `patternReplace`: `ZodOptional`\<`ZodString`\>; `removeHtml`: `ZodOptional`\<`ZodBoolean`\>; `values`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaSynonymValueBase"`\>; `maps`: `ZodOptional`\<`ZodNumber`\>; `name`: `ZodString`; `path`: `ZodOptional`\<`ZodString`\>; `refType`: `ZodOptional`\<`ZodUnion`\<readonly \[..., ...\]\>\>; `value`: `ZodOptional`\<`ZodNumber`\>; \}, `$loose`\>\>\>; \}, `$loose`\>; `sources`: `ZodArray`\<`ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<`ZodUnknown`\>; \}, `$loose`\>\>; \}, `$loose`\>

Defined in: [packages/core/src/generated/zod-schemas.ts:160](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/core/src/generated/zod-schemas.ts#L160)
